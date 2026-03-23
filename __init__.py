import os
import sys
import subprocess
import importlib

# ── 의존 패키지 자동 설치 (pandas, openpyxl) ─────────────────────────────────
_REQUIRED = {
    "pandas":  "pandas",
    "openpyxl": "openpyxl",
}

def _ensure_packages():
    for import_name, pip_name in _REQUIRED.items():
        try:
            importlib.import_module(import_name)
        except ImportError:
            print(f"[ExcelPromptGenerator] '{pip_name}' not found. Installing...")
            try:
                subprocess.check_call(
                    [sys.executable, "-m", "pip", "install", pip_name,
                     "--quiet", "--no-warn-script-location"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.STDOUT,
                )
                print(f"[ExcelPromptGenerator] '{pip_name}' installed successfully.")
            except subprocess.CalledProcessError as e:
                print(f"[ExcelPromptGenerator] ERROR: Failed to install '{pip_name}': {e}")

_ensure_packages()

import torch
import pandas as pd
import folder_paths
from server import PromptServer
from aiohttp import web

TEMP_DIR = os.path.join(folder_paths.get_input_directory(), "excel_prompts")
os.makedirs(TEMP_DIR, exist_ok=True)


def _is_blank(val) -> bool:
    """셀 값이 비어있으면 True"""
    if val is None:
        return True
    if isinstance(val, float) and (val != val):  # NaN
        return True
    return str(val).strip().lower() in ("", "nan", "none", "nat")


def _backfill_value(df, column: str, idx: int):
    """idx 행이 비어있으면 위로 거슬러 올라가 마지막 유효값 반환. 없으면 None."""
    for i in range(idx, -1, -1):
        val = df[column].iloc[i]
        if not _is_blank(val):
            return str(val).strip()
    return None


class ExcelPromptGenerator:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "clip":          ("CLIP",),
                "filename":      ("STRING", {"default": ""}),
                "select_column": ("STRING", {"default": ""}),
                "current_index": ("INT", {"default": 0, "min": 0, "max": 1000000, "step": 1}),
            },
            "optional": {
                "width_column":  ("STRING", {"default": ""}),
                "height_column": ("STRING", {"default": ""}),
            }
        }

    RETURN_TYPES  = ("CONDITIONING", "LATENT")
    RETURN_NAMES  = ("conditioning", "latent")
    FUNCTION      = "generate"
    CATEGORY      = "ExcelNodes"

    def generate(self, clip, filename, select_column, current_index,
                 width_column="", height_column=""):

        def empty(w=512, h=512):
            tokens = clip.tokenize("")
            cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)
            latent = torch.zeros([1, 4, h // 8, w // 8])
            return ([[cond, {"pooled_output": pooled}]], {"samples": latent})

        if not filename:
            return empty()
        if not select_column:
            return empty()

        file_path = os.path.join(TEMP_DIR, filename)
        if not os.path.exists(file_path):
            return empty()

        try:
            df = (pd.read_csv(file_path)
                  if filename.lower().endswith('.csv')
                  else pd.read_excel(file_path))

            if select_column not in df.columns:
                return empty()

            total = len(df)
            if total == 0:
                return empty()

            idx = current_index % total

            # ── 프롬프트 (빈 행이면 empty 반환 — JS가 이미 스킵했어야 하지만 안전장치)
            prompt_val = df[select_column].iloc[idx]
            if _is_blank(prompt_val):
                return empty()
            text = str(prompt_val).strip()

            # ── Width / Height — 비어있으면 위 행으로 backfill ─────
            width  = 512
            height = 512

            if width_column and width_column in df.columns:
                raw = _backfill_value(df, width_column, idx)
                if raw is not None:
                    try:
                        width = max(64, (int(float(raw)) // 8) * 8)
                    except Exception:
                        width = 512

            if height_column and height_column in df.columns:
                raw = _backfill_value(df, height_column, idx)
                if raw is not None:
                    try:
                        height = max(64, (int(float(raw)) // 8) * 8)
                    except Exception:
                        height = 512

            # ── CLIP 인코딩 ───────────────────────────────────────
            tokens = clip.tokenize(text)
            cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)

            latent = torch.zeros([1, 4, height // 8, width // 8])

            PromptServer.instance.send_sync("excel_prompt_update", {
                "text":   text,
                "index":  idx,
                "total":  total,
                "width":  width,
                "height": height,
            })

            return ([[cond, {"pooled_output": pooled}]], {"samples": latent})

        except Exception as e:
            return empty()


# ── API: 엑셀 업로드 ──────────────────────────────────────────
@PromptServer.instance.routes.post("/excel_prompt/upload")
async def upload_excel(request):
    data = await request.post()
    file = data.get("file")
    if not file:
        return web.Response(status=400, text="No file")

    file_path = os.path.join(TEMP_DIR, file.filename)
    with open(file_path, "wb") as f:
        f.write(file.file.read())

    try:
        df = (pd.read_csv(file_path)
              if file.filename.lower().endswith('.csv')
              else pd.read_excel(file_path))

        return web.json_response({
            "filename":   file.filename,
            "rows":       len(df),
            "cols":       len(df.columns),
            "headers":    [str(c) for c in df.columns],
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


print("### [ExcelPromptGenerator] Loaded OK")

NODE_CLASS_MAPPINGS = {"ExcelPromptGenerator": ExcelPromptGenerator}
NODE_DISPLAY_NAME_MAPPINGS = {"ExcelPromptGenerator": "Excel To Prompt A1"}
WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
