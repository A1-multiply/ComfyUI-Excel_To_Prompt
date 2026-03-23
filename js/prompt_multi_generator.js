import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// ══════════════════════════════════════════════════════════════
//  다국어 텍스트 정의
// ══════════════════════════════════════════════════════════════
const T = {
    ENG: {
        fileInfoDefault:  "Load a file  →  Click LOAD button below",
        fileReading:      "⏳  Reading file...",
        fileErrPrefix:    "❌  Error: ",
        uploadFail:       "❌  Upload failed: ",
        promptColLabel:   "📊  PROMPT COLUMN (column to use as prompt)",
        promptColDefault: "Load file to populate",
        widthColLabel:    "↔️  WIDTH COLUMN (Optional)",
        heightColLabel:   "↕️  HEIGHT COLUMN (Optional)",
        noneOpt:          "None",
        startIdxLabel:    "🎯  START INDEX (start row  /  1 = first)",
        finishIdxLabel:   "🏁  FINISH INDEX (end row  /  default = last row)",
        availWarn:        "⚠️  Please load a file first!",
        availFmt:         (n, s, f) => `Total ${n} prompts   (rows ${s} ~ ${f})`,
        loadBtn:          "📂   LOAD EXCEL / CSV",
        promptInit:       "── Not started yet ──\nPrompts will appear here in order when Queue runs.",
        promptReady:      "▶  Ready — run Queue to display prompts.",
        progressIdle:     "─  Not started yet  ─",
        etaCalc:          "Calculating...",
        etaDone:          "✅ Done!",
        etaFmt:           (m, s) => m > 0 ? `~${m}m ${s}s` : `~${s}s`,
        etaLabel:         "Estimated remaining:",
        infoProgress:     (di, tot) => `[${di} / ${tot}] Running`,
        alertNoFile:      "Please load an Excel file first.",
        alertIdxErr:      (cs, cf) => `START INDEX(${cs}) > FINISH INDEX(${cf})`,
        queueLog:         (cs, cf, n) => `[Excel] Run: rows ${cs}~${cf}  (${n} times)`,
    },
    KOR: {
        fileInfoDefault:  "파일을 로드하세요  →  아래 LOAD 버튼 클릭",
        fileReading:      "⏳  파일 읽는 중...",
        fileErrPrefix:    "❌  오류: ",
        uploadFail:       "❌  업로드 실패: ",
        promptColLabel:   "📊  PROMPT COLUMN (프롬프트로 사용할 열)",
        promptColDefault: "파일 로드 후 자동 채워짐",
        widthColLabel:    "↔️  WIDTH COLUMN (선택사항)",
        heightColLabel:   "↕️  HEIGHT COLUMN (선택사항)",
        noneOpt:          "None",
        startIdxLabel:    "🎯  START INDEX (시작 행  /  1 = 첫 번째)",
        finishIdxLabel:   "🏁  FINISH INDEX (끝 행  /  기본값 = 마지막 행)",
        availWarn:        "⚠️  파일을 먼저 로드하세요!",
        availFmt:         (n, s, f) => `총  ${n}개의 프롬프트를 실행합니다   (행 ${s} ~ ${f})`,
        loadBtn:          "📂   LOAD EXCEL / CSV",
        promptInit:       "── 아직 실행되지 않음 ──\nQueue를 실행하면 여기에 프롬프트가 순서대로 표시됩니다.",
        promptReady:      "▶  Queue를 실행하면 여기에 프롬프트가 순서대로 표시됩니다.",
        progressIdle:     "─  아직 시작되지 않음  ─",
        etaCalc:          "계산 중...",
        etaDone:          "✅ 완료!",
        etaFmt:           (m, s) => m > 0 ? `약 ${m}분 ${s}초` : `약 ${s}초`,
        etaLabel:         "예상 남은 시간:",
        infoProgress:     (di, tot) => `[${di} / ${tot}] 진행 중`,
        alertNoFile:      "엑셀 파일을 먼저 로드하세요.",
        alertIdxErr:      (cs, cf) => `START INDEX(${cs}) > FINISH INDEX(${cf})`,
        queueLog:         (cs, cf, n) => `[Excel] 실행: 행 ${cs}~${cf}  (${n}회)`,
    },
};


// ══════════════════════════════════════════════════════════════
//  캔버스 전용 정보 바
// ══════════════════════════════════════════════════════════════
function makeInfoBar(name, initVal, opts = {}) {
    return {
        type: "excel_canvas_bar",
        name,
        value: initVal,
        options: {},
        serialize: false,
        _color:    opts.color    ?? "#aaaaaa",
        _bg:       opts.bg       ?? "rgba(255,255,255,0.04)",
        _border:   opts.border   ?? "rgba(255,255,255,0.10)",
        _height:   opts.height   ?? 38,
        _fontSize: opts.fontSize ?? 12,
        _bold:     opts.bold     ?? false,

        draw(ctx, node, width, posY, H) {
            const h   = H || this._height;
            const pad = 10;
            ctx.save();
            ctx.fillStyle = this._bg;
            ctx.beginPath();
            ctx.roundRect(pad, posY + 2, width - pad * 2, h - 4, 5);
            ctx.fill();
            ctx.strokeStyle = this._border;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = this._color;
            ctx.font = `${this._bold ? "bold " : ""}${this._fontSize}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            let txt = String(this.value ?? "");
            const maxW = width - pad * 2 - 8;
            while (txt.length > 5 && ctx.measureText(txt).width > maxW) {
                txt = txt.slice(0, -1);
            }
            if (txt !== String(this.value ?? "")) txt += "…";
            ctx.fillText(txt, width / 2, posY + h / 2);
            ctx.restore();
        },
        computeSize(w) { return [w, this._height]; },
    };
}

// ══════════════════════════════════════════════════════════════
//  캔버스 직접 그리기 - 진행 상황 바 (X/Y / % / ETA)
// ══════════════════════════════════════════════════════════════
function makeProgressBar(initState, getLang) {
    return {
        type: "excel_progress_bar",
        name: "PROGRESS",
        value: initState ?? { current: 0, total: 0, times: [], etaStr: "─" },
        options: {},
        serialize: false,
        _height: 82,
        _getLang: getLang ?? (() => "ENG"),

        draw(ctx, node, width, posY, H) {
            const pad    = 10;
            const x      = pad;
            const y      = posY + 2;
            const w      = width - pad * 2;
            const innerH = this._height - 4;
            const ps     = this.value ?? {};
            const lang   = T[this._getLang() ?? "ENG"] ?? T.ENG;

            ctx.save();

            ctx.fillStyle = "rgba(15,15,25,0.80)";
            ctx.beginPath();
            ctx.roundRect(x, y, w, innerH, 6);
            ctx.fill();
            ctx.strokeStyle = "rgba(100,180,255,0.18)";
            ctx.lineWidth = 1;
            ctx.stroke();

            if (!ps.total || ps.total === 0) {
                ctx.fillStyle = "rgba(150,150,150,0.45)";
                ctx.font = "12px monospace";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(lang.progressIdle, width / 2, y + innerH / 2);
                ctx.restore();
                return;
            }

            const cur   = ps.current ?? 0;
            const total = ps.total;
            const pct   = Math.round((cur / total) * 100);

            ctx.fillStyle = "#e0e0e0";
            ctx.font = "bold 13px monospace";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.fillText(`${cur}  /  ${total}`, x + 12, y + 9);

            ctx.fillStyle = "#74b9ff";
            ctx.textAlign = "right";
            ctx.fillText(`${pct}%`, x + w - 12, y + 9);

            const barX = x + 12;
            const barY = y + 32;
            const barW = w - 24;
            const barH = 11;

            ctx.fillStyle = "rgba(255,255,255,0.07)";
            ctx.beginPath();
            ctx.roundRect(barX, barY, barW, barH, 5);
            ctx.fill();

            const fillW = Math.max(0, Math.min(barW, barW * (cur / total)));
            if (fillW > 0) {
                const grad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
                grad.addColorStop(0, "#0984e3");
                grad.addColorStop(1, "#74b9ff");
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.roundRect(barX, barY, fillW, barH, 5);
                ctx.fill();
            }

            const eta = ps.etaStr ?? "─";
            ctx.fillStyle = "rgba(200,200,200,0.65)";
            ctx.font = "11px monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText(`${lang.etaLabel}  ${eta}`, width / 2, y + 51);

            ctx.restore();
        },

        computeSize(w) { return [w, this._height]; },
    };
}

// ══════════════════════════════════════════════════════════════
app.registerExtension({
    name: "Comfy.ExcelPromptGenerator",

    // ── Queue 인터셉터 ──────────────────────────────────────────
    setup() {
        const origQueue = app.queuePrompt.bind(app);
        app.queuePrompt = async function (number, batchCount) {
            const excelNodes = app.graph?._nodes?.filter(
                n => n.type === "ExcelPromptGenerator"
            ) ?? [];
            if (excelNodes.length === 0) return origQueue(number, batchCount);

            const node      = excelNodes[0];
            const lang      = T[node._lang ?? "ENG"] ?? T.ENG;
            const totalRows = node._totalRows ?? 0;
            if (totalRows === 0) { alert(lang.alertNoFile); return; }

            const cs = Math.min(Math.max(0, (node._startIdx  ?? 1) - 1), totalRows - 1);
            const cf = Math.min(Math.max(0, (node._finishIdx ?? 1) - 1), totalRows - 1);
            if (cs > cf) {
                alert(lang.alertIdxErr(cs + 1, cf + 1));
                return;
            }

            const wIndex = node.widgets?.find(w => w.name === "current_index");
            const totalCount = cf - cs + 1;
            console.log(lang.queueLog(cs + 1, cf + 1, totalCount));

            // cs ~ cf 범위 전체 행 순서대로 큐잉
            node._queueTotal    = totalCount;
            node._queueStartIdx = cs;

            for (let rowIdx = cs; rowIdx <= cf; rowIdx++) {
                if (wIndex) wIndex.value = rowIdx;
                try {
                    const prompt = await app.graphToPrompt();
                    await api.queuePrompt(number, prompt);
                } catch (err) {
                    console.error("[Excel] Queue error:", err); break;
                }
            }
        };
    },

    // ── 노드 UI ─────────────────────────────────────────────────
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "ExcelPromptGenerator") return;

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated ? onCreated.apply(this, arguments) : undefined;

            // ── 언어 상태 ─────────────────────────────────────────
            this._lang = "ENG";
            const getLang = () => this._lang;

            // ── 파이썬 위젯 참조 ──────────────────────────────────
            const getW = n => this.widgets?.find(w => w.name === n);
            const wFile      = getW("filename");
            const wCol       = getW("select_column");
            const wIdx       = getW("current_index");
            const wWidthCol  = getW("width_column");
            const wHeightCol = getW("height_column");

            // 완전 숨김
            const fullyHide = w => {
                if (!w) return;
                w.computeSize = () => [0, 0];
                w.draw = () => {};
                if (w.inputEl) {
                    w.inputEl.style.display = "none";
                    w.inputEl.style.height  = "0";
                }
            };
            fullyHide(wFile);
            fullyHide(wCol);
            fullyHide(wIdx);
            fullyHide(wWidthCol);
            fullyHide(wHeightCol);

            this._totalRows   = 0;
            this._startIdx    = 1;
            this._finishIdx   = 1;
            this._promptState = "init";
            this.widgets = this.widgets ?? [];

            const repaint = () => app.graph?.setDirtyCanvas(true, false);

            // ── refreshAvail (언어 반응형) ─────────────────────────
            const refreshAvail = () => {
                const bar  = this._availBar;
                const lang = T[getLang()] ?? T.ENG;
                if (!bar) return;
                if (this._totalRows === 0) {
                    bar._color  = "#ff6b6b";
                    bar._bg     = "rgba(255,107,107,0.07)";
                    bar._border = "rgba(255,107,107,0.35)";
                    bar.value   = lang.availWarn;
                } else {
                    const s = this._startIdx;
                    const f = Math.min(this._finishIdx, this._totalRows);
                    const n = Math.max(0, f - s + 1);
                    bar._color  = "#55efc4";
                    bar._bg     = "rgba(85,239,196,0.07)";
                    bar._border = "rgba(85,239,196,0.4)";
                    bar.value   = lang.availFmt(n, s, f);
                }
                repaint();
            };

            // ── _applyLang(): 모든 위젯 레이블 + 텍스트 즉시 갱신 ────
            this._applyLang = () => {
                const lang = T[getLang()] ?? T.ENG;
                if (this._colCombo)    this._colCombo.name    = lang.promptColLabel;
                if (this._widthCombo)  this._widthCombo.name  = lang.widthColLabel;
                if (this._heightCombo) this._heightCombo.name = lang.heightColLabel;
                if (this._startW)      this._startW.name      = lang.startIdxLabel;
                if (this._finishW)     this._finishW.name     = lang.finishIdxLabel;
                if (this._loadBtn)     this._loadBtn.name     = lang.loadBtn;
                // infoBar: 파일 미로드 상태면 기본 텍스트 갱신
                if (this._totalRows === 0 && this._infoBar)
                    this._infoBar.value = lang.fileInfoDefault;
                // infoBar: 진행 중 상태면 진행 텍스트 즉시 재조합 (언어 반영)
                if (this._promptState === "running" && this._infoBar && this._infoBase != null) {
                    const ps = this._progressState ?? {};
                    this._infoBar.value = `${this._infoBase}   │   ${lang.infoProgress(ps.current ?? 0, ps.total ?? "?")}`;
                }
                // progressWidget: etaStr 재계산 (언어 반영)
                if (this._promptState === "running" && this._progressState) {
                    const ps    = this._progressState;
                    const avgMs  = this._lastAvgMs ?? 0;
                    const remain = this._lastRemain ?? 0;
                    if (remain === 0) {
                        ps.etaStr = lang.etaDone;
                    } else if (avgMs > 0) {
                        const remainMs = avgMs * remain;
                        const mins = Math.floor(remainMs / 60000);
                        const secs = Math.floor((remainMs % 60000) / 1000);
                        ps.etaStr = lang.etaFmt(mins, secs);
                    } else {
                        ps.etaStr = lang.etaCalc;
                    }
                    if (this._progressWidget) this._progressWidget.value = { ...ps };
                }
                // textarea: init/ready 상태면 즉시 갱신
                if (this._promptEl) {
                    if (this._promptState === "init")  this._promptEl.value = lang.promptInit;
                    if (this._promptState === "ready") this._promptEl.value = lang.promptReady;
                }
                refreshAvail();
            };

            // ───────────────────────────────────────────────────────
            // [1] FILE INFO bar
            this._infoBar = makeInfoBar("📁  FILE INFO",
                T[getLang()].fileInfoDefault, {
                color: "#888888", bg: "rgba(255,255,255,0.03)",
                border: "rgba(255,255,255,0.09)", height: 40, fontSize: 12,
            });
            this.widgets.push(this._infoBar);

            // [2] PROMPT COLUMN
            this._colCombo = this.addWidget(
                "combo", T[getLang()].promptColLabel,
                T[getLang()].promptColDefault,
                v => { if (wCol) wCol.value = v; repaint(); },
                { values: [T[getLang()].promptColDefault] }
            );

            // [3] WIDTH COLUMN (Optional)
            this._widthCombo = this.addWidget(
                "combo", T[getLang()].widthColLabel,
                "None",
                v => { if (wWidthCol) wWidthCol.value = (v === "None" ? "" : v); },
                { values: ["None"] }
            );

            // [4] HEIGHT COLUMN (Optional)
            this._heightCombo = this.addWidget(
                "combo", T[getLang()].heightColLabel,
                "None",
                v => { if (wHeightCol) wHeightCol.value = (v === "None" ? "" : v); },
                { values: ["None"] }
            );

            // [5] START INDEX
            this._startW = this.addWidget(
                "number", T[getLang()].startIdxLabel, 1,
                v => { this._startIdx = Math.max(1, Math.floor(v)); refreshAvail(); },
                { min: 1, max: 1000000, step: 1, precision: 0 }
            );

            // [6] FINISH INDEX
            this._finishW = this.addWidget(
                "number", T[getLang()].finishIdxLabel, 1,
                v => { this._finishIdx = Math.max(1, Math.floor(v)); refreshAvail(); },
                { min: 1, max: 1000000, step: 1, precision: 0 }
            );

            // [7] TOTAL AVAILABLE bar
            this._availBar = makeInfoBar("📌  TOTAL",
                T[getLang()].availWarn, {
                color: "#ff6b6b", bg: "rgba(255,107,107,0.07)",
                border: "rgba(255,107,107,0.35)",
                height: 44, fontSize: 13, bold: true,
            });
            this.widgets.push(this._availBar);

            // [8] CURRENT PROMPT (DOM textarea - 선택/복사 가능, 수정 불가)
            const promptTextarea = document.createElement("textarea");
            promptTextarea.readOnly  = true;
            promptTextarea.spellcheck = false;
            promptTextarea.value = T[getLang()].promptInit;
            Object.assign(promptTextarea.style, {
                width:            "100%",
                height:           "150px",
                resize:           "none",
                background:       "rgba(15,15,20,0.88)",
                color:            "#dddddd",
                border:           "1.2px solid rgba(100,180,255,0.28)",
                borderRadius:     "6px",
                padding:          "10px 10px",
                fontFamily:       "monospace",
                fontSize:         "12px",
                lineHeight:       "1.7",
                boxSizing:        "border-box",
                outline:          "none",
                cursor:           "text",
                userSelect:       "text",
                WebkitUserSelect: "text",
                overflowY:        "auto",
            });
            this._promptEl     = promptTextarea;
            this._promptWidget = this.addDOMWidget(
                "prompt_display", "textarea", promptTextarea,
                {
                    getValue:    () => promptTextarea.value,
                    setValue:    (v) => { promptTextarea.value = v; },
                    computeSize: (w) => [w, 158],
                }
            );
            if (this._promptWidget) this._promptWidget.computeSize = (w) => [w, 158];

            // [9] PROGRESS / ETA bar
            this._progressState  = { current: 0, total: 0, times: [], etaStr: "─" };
            this._progressWidget = makeProgressBar(this._progressState, getLang);
            this.widgets.push(this._progressWidget);

            // [10] LOAD 버튼
            this._loadBtn = this.addWidget(
                "button", T[getLang()].loadBtn, null,
                () => {
                    const inp = document.createElement("input");
                    inp.type = "file"; inp.accept = ".xlsx,.xls,.csv";
                    inp.style.display = "none";
                    document.body.appendChild(inp);

                    inp.onchange = async e => {
                        const file = e.target.files[0];
                        inp.remove();
                        if (!file) return;

                        const lang = T[getLang()] ?? T.ENG;
                        this._infoBar.value = lang.fileReading;
                        repaint();

                        const fd = new FormData();
                        fd.append("file", file);
                        try {
                            const res = await fetch("/excel_prompt/upload", { method: "POST", body: fd });
                            const d   = await res.json();

                            if (d.error) {
                                this._infoBar.value = lang.fileErrPrefix + d.error;
                                repaint(); return;
                            }

                            if (wFile) wFile.value = d.filename;
                            this._totalRows = d.rows;

                            this._infoBar.value =
                                `${d.filename}   │   ROW: ${d.rows}   │   COL: ${d.cols}`;

                            // PROMPT COLUMN
                            if (this._colCombo) {
                                this._colCombo.options.values = d.headers;
                                this._colCombo.value          = d.headers[0] ?? "";
                                if (wCol) wCol.value          = d.headers[0] ?? "";
                            }
                            // WIDTH / HEIGHT COLUMN (Optional)
                            const optHeaders = ["None", ...d.headers];
                            if (this._widthCombo) {
                                this._widthCombo.options.values = optHeaders;
                                this._widthCombo.value          = "None";
                                if (wWidthCol) wWidthCol.value  = "";
                            }
                            if (this._heightCombo) {
                                this._heightCombo.options.values = optHeaders;
                                this._heightCombo.value          = "None";
                                if (wHeightCol) wHeightCol.value = "";
                            }

                            if (this._startW) {
                                this._startW.options.max = d.rows;
                                this._startW.value = 1; this._startIdx = 1;
                            }
                            if (this._finishW) {
                                this._finishW.options.max = d.rows;
                                this._finishW.value = d.rows;
                                this._finishIdx     = d.rows;
                            }
                            if (wIdx) { wIdx.value = 0; wIdx.options.max = d.rows - 1; }

                            refreshAvail();

                            this._promptState = "ready";
                            if (this._promptEl)
                                this._promptEl.value = lang.promptReady;

                            this._progressState = { current: 0, total: 0, times: [], etaStr: "─" };
                            if (this._progressWidget) this._progressWidget.value = this._progressState;

                            this.setDirtyCanvas(true, true);
                        } catch (err) {
                            console.error(err);
                            this._infoBar.value = (T[getLang()] ?? T.ENG).uploadFail + err;
                            repaint();
                        }
                    };
                    inp.click();
                }
            );
            this._loadBtn.computeSize = w => [w, 46];

            // ── 실시간 프롬프트 수신 ─────────────────────────────────
            const onUpdate = evt => {
                const { text, index } = evt.detail ?? {};
                const qTotal = this._queueTotal ?? 0;
                const di     = (index ?? 0) - (this._queueStartIdx ?? 0) + 1;
                const now    = Date.now();
                const lang   = T[getLang()] ?? T.ENG;

                if (this._promptEl) this._promptEl.value = text ?? "";
                this._promptState = "running";

                const ps = this._progressState ?? {};
                if (di === 1 || !ps.lastRawIndex || index < ps.lastRawIndex) {
                    ps.times         = [];
                    ps.lastEventTime = null;
                }
                if (ps.lastEventTime) {
                    ps.times.push(now - ps.lastEventTime);
                }
                ps.lastEventTime = now;
                ps.lastRawIndex  = index;
                ps.current       = di;
                ps.total         = qTotal;   // 파일 전체 행 수 대신 실제 큐 개수 사용

                // 진행 계산 값 저장 (언어 전환 시 재계산용)
                if (ps.times.length > 0) {
                    const avgMs    = ps.times.reduce((a, b) => a + b, 0) / ps.times.length;
                    const remain   = Math.max(0, qTotal - di);   // qTotal 기준
                    const remainMs = avgMs * remain;
                    this._lastAvgMs  = avgMs;
                    this._lastRemain = remain;
                    if (remain === 0) {
                        ps.etaStr = lang.etaDone;
                    } else {
                        const mins = Math.floor(remainMs / 60000);
                        const secs = Math.floor((remainMs % 60000) / 1000);
                        ps.etaStr  = lang.etaFmt(mins, secs);
                    }
                } else {
                    this._lastAvgMs  = 0;
                    this._lastRemain = qTotal - di;   // qTotal 기준
                    ps.etaStr = lang.etaCalc;
                }
                this._progressState = ps;
                if (this._progressWidget) this._progressWidget.value = { ...ps };

                // infoBar 갱신 - base(파일명 부분)와 progress suffix 분리 저장
                if (this._infoBar) {
                    this._infoBase      = (this._infoBar.value ?? "").split("   │   [")[0];
                    this._infoBar.value = `${this._infoBase}   │   ${lang.infoProgress(di, qTotal)}`;
                }
                this.setDirtyCanvas(true, true);
            };
            api.addEventListener("excel_prompt_update", onUpdate);

            const origRemoved = this.onRemoved;
            this.onRemoved = function () {
                api.removeEventListener("excel_prompt_update", onUpdate);
                if (origRemoved) origRemoved.apply(this, arguments);
            };

            this.setSize([520, 560]);
            return r;
        };

        // ── 언어 토글 버튼 (타이틀 우측 상단) ──────────────────────
        const origDrawFG = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            if (origDrawFG) origDrawFG.apply(this, arguments);
            if (this.flags?.collapsed) return;

            const lang    = this._lang ?? "ENG";
            const titleH  = LiteGraph.NODE_TITLE_HEIGHT ?? 30;
            const bW = 70;
            const bH = 18;
            const bX = this.size[0] - bW - 8;
            const bY = -titleH + (titleH - bH) / 2;

            ctx.save();

            // 전체 배경
            ctx.fillStyle = "rgba(20,20,30,0.85)";
            ctx.beginPath();
            ctx.roundRect(bX, bY, bW, bH, 4);
            ctx.fill();
            ctx.strokeStyle = "rgba(180,180,220,0.3)";
            ctx.lineWidth = 0.8;
            ctx.stroke();

            // ENG 활성 반쪽
            if (lang === "ENG") {
                ctx.fillStyle = "rgba(50,140,255,0.55)";
                ctx.beginPath();
                ctx.roundRect(bX + 1, bY + 1, bW / 2 - 1, bH - 2, 3);
                ctx.fill();
            }
            // KOR 활성 반쪽
            if (lang === "KOR") {
                ctx.fillStyle = "rgba(255,120,60,0.55)";
                ctx.beginPath();
                ctx.roundRect(bX + bW / 2, bY + 1, bW / 2 - 1, bH - 2, 3);
                ctx.fill();
            }

            ctx.font = "bold 9px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const mid = bY + bH / 2;
            ctx.fillStyle = lang === "ENG" ? "#ffffff" : "rgba(200,200,200,0.5)";
            ctx.fillText("ENG", bX + bW / 4, mid);
            ctx.fillStyle = lang === "KOR" ? "#ffffff" : "rgba(200,200,200,0.5)";
            ctx.fillText("KOR", bX + (3 * bW) / 4, mid);

            ctx.restore();
        };

        // ── 토글 클릭 감지 ────────────────────────────────────────
        const origMouseDown = nodeType.prototype.onMouseDown;
        nodeType.prototype.onMouseDown = function (e, localPos, graphCanvas) {
            const titleH = LiteGraph.NODE_TITLE_HEIGHT ?? 30;
            const bW = 70;
            const bH = 18;
            const bX = this.size[0] - bW - 8;
            const bY = -titleH + (titleH - bH) / 2;

            if (
                localPos[0] >= bX && localPos[0] <= bX + bW &&
                localPos[1] >= bY && localPos[1] <= bY + bH
            ) {
                this._lang = (this._lang === "KOR") ? "ENG" : "KOR";
                if (this._applyLang) this._applyLang();
                this.setDirtyCanvas(true, true);
                return true;   // 이벤트 소비 (드래그 방지)
            }

            if (origMouseDown) return origMouseDown.apply(this, arguments);
        };
    },
});
