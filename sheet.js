// Sheet Playground: a small spreadsheet grid with its own formula evaluator.
// Formulas are parsed by hand (no eval), so typed text can never run as code.
(function () {
    'use strict';

    const COLS = 26;
    const ROWS = 50;
    const STORAGE_KEY = 'skillin-sheet';
    const TOKEN_RE = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|([A-Za-z]+\d+)(?!\s*\()|([A-Za-z]+)(?=\s*\()|([-+*/^(),:]))/y;

    const EXAMPLE = {
        A1: 'Item', B1: 'Cost',
        A2: 'Coffee', B2: '3.5',
        A3: 'Bagel', B3: '2.25',
        A4: 'Juice', B4: '4',
        A5: 'Total', B5: '=SUM(B2:B4)',
        A6: 'Average', B6: '=AVERAGE(B2:B4)',
        A7: 'Most expensive', B7: '=MAX(B2:B4)',
        A8: 'Total with 17% tax', B8: '=ROUND(B5*1.17, 2)'
    };

    // Raw text the user typed, keyed by cell name such as "B3".
    const cells = new Map();
    // Computed values for the current state of the sheet. Cleared on every render.
    const cache = new Map();
    let selected = 'A1';

    const sheetEl = document.getElementById('sheet');
    const cellNameEl = document.getElementById('cellName');
    const formulaBarEl = document.getElementById('formulaBar');
    const statusEl = document.getElementById('status');

    class SheetError {
        constructor(code) {
            this.code = code;
        }
    }

    function colName(index) {
        let name = '';
        let n = index + 1;
        while (n > 0) {
            name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
            n = Math.floor((n - 1) / 26);
        }
        return name;
    }

    function colIndex(letters) {
        let n = 0;
        for (const ch of letters) {
            n = n * 26 + (ch.charCodeAt(0) - 64);
        }
        return n - 1;
    }

    function refKey(col, row) {
        return colName(col) + row;
    }

    function parseRef(ref) {
        const match = /^([A-Z]+)(\d+)$/.exec(ref);
        const col = colIndex(match[1]);
        const row = Number(match[2]);
        if (col >= COLS || row < 1 || row > ROWS) {
            throw new SheetError('#REF!');
        }
        return { col, row };
    }

    function tokenize(src) {
        const tokens = [];
        const re = new RegExp(TOKEN_RE.source, 'y');
        let pos = 0;
        while (pos < src.length) {
            re.lastIndex = pos;
            const m = re.exec(src);
            if (!m) {
                if (/^\s*$/.test(src.slice(pos))) break;
                throw new SheetError('#SYNTAX!');
            }
            pos = re.lastIndex;
            if (m[1] !== undefined) tokens.push({ type: 'num', value: parseFloat(m[1]) });
            else if (m[2] !== undefined) tokens.push({ type: 'ref', value: m[2].toUpperCase() });
            else if (m[3] !== undefined) tokens.push({ type: 'func', value: m[3].toUpperCase() });
            else tokens.push({ type: 'op', value: m[4] });
        }
        return tokens;
    }

    function toNumber(value) {
        if (value === null) return 0;
        if (typeof value === 'number') return value;
        throw new SheetError('#VALUE!');
    }

    function parseLiteral(raw) {
        const text = raw.trim();
        if (text === '') return null;
        if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(text)) return Number(text);
        return raw;
    }

    function cellValueOrThrow(ref, stack) {
        parseRef(ref);
        const value = cellValue(ref, stack);
        if (value instanceof SheetError) throw value;
        return value;
    }

    function rangeValues(startRef, endRef, stack) {
        const a = parseRef(startRef);
        const b = parseRef(endRef);
        const values = [];
        for (let row = Math.min(a.row, b.row); row <= Math.max(a.row, b.row); row++) {
            for (let col = Math.min(a.col, b.col); col <= Math.max(a.col, b.col); col++) {
                values.push(cellValueOrThrow(refKey(col, row), stack));
            }
        }
        return values;
    }

    function callFunction(name, args) {
        const numbers = () => args.flat().filter((v) => typeof v === 'number');
        const sum = (list) => list.reduce((total, v) => total + v, 0);
        switch (name) {
            case 'SUM':
                return sum(numbers());
            case 'AVERAGE': {
                const nums = numbers();
                if (nums.length === 0) throw new SheetError('#DIV/0!');
                return sum(nums) / nums.length;
            }
            case 'MIN': {
                const nums = numbers();
                return nums.length ? Math.min(...nums) : 0;
            }
            case 'MAX': {
                const nums = numbers();
                return nums.length ? Math.max(...nums) : 0;
            }
            case 'COUNT':
                return numbers().length;
            case 'ROUND': {
                const value = toNumber(args[0]);
                const factor = Math.pow(10, args.length > 1 ? toNumber(args[1]) : 0);
                return Math.round(value * factor) / factor;
            }
            default:
                throw new SheetError('#NAME?');
        }
    }

    // Recursive-descent parser: + - (lowest), * /, ^, unary sign, then values.
    function evaluate(formula, stack) {
        const tokens = tokenize(formula);
        let pos = 0;

        const peekOp = (op) => pos < tokens.length && tokens[pos].type === 'op' && tokens[pos].value === op;

        function parseExpression() {
            let result = parseTerm();
            while (peekOp('+') || peekOp('-')) {
                const op = tokens[pos++].value;
                const right = parseTerm();
                result = op === '+' ? toNumber(result) + toNumber(right) : toNumber(result) - toNumber(right);
            }
            return result;
        }

        function parseTerm() {
            let result = parseFactor();
            while (peekOp('*') || peekOp('/')) {
                const op = tokens[pos++].value;
                const right = toNumber(parseFactor());
                if (op === '/') {
                    if (right === 0) throw new SheetError('#DIV/0!');
                    result = toNumber(result) / right;
                } else {
                    result = toNumber(result) * right;
                }
            }
            return result;
        }

        function parseFactor() {
            const base = parseUnary();
            if (peekOp('^')) {
                pos++;
                return Math.pow(toNumber(base), toNumber(parseFactor()));
            }
            return base;
        }

        function parseUnary() {
            if (peekOp('-')) {
                pos++;
                return -toNumber(parseUnary());
            }
            if (peekOp('+')) {
                pos++;
                return toNumber(parseUnary());
            }
            return parsePrimary();
        }

        function parsePrimary() {
            const token = tokens[pos++];
            if (!token) throw new SheetError('#SYNTAX!');

            if (token.type === 'num') return token.value;

            if (token.type === 'ref') {
                if (peekOp(':')) {
                    pos++;
                    const end = tokens[pos++];
                    if (!end || end.type !== 'ref') throw new SheetError('#SYNTAX!');
                    return rangeValues(token.value, end.value, stack);
                }
                return cellValueOrThrow(token.value, stack);
            }

            if (token.type === 'func') {
                if (!peekOp('(')) throw new SheetError('#SYNTAX!');
                pos++;
                const args = [];
                if (!peekOp(')')) {
                    args.push(parseExpression());
                    while (peekOp(',')) {
                        pos++;
                        args.push(parseExpression());
                    }
                }
                if (!peekOp(')')) throw new SheetError('#SYNTAX!');
                pos++;
                return callFunction(token.value, args);
            }

            if (token.type === 'op' && token.value === '(') {
                const inner = parseExpression();
                if (!peekOp(')')) throw new SheetError('#SYNTAX!');
                pos++;
                return inner;
            }

            throw new SheetError('#SYNTAX!');
        }

        const result = parseExpression();
        if (pos < tokens.length) throw new SheetError('#SYNTAX!');
        return result;
    }

    function cellValue(ref, stack) {
        if (cache.has(ref)) return cache.get(ref);

        const raw = cells.get(ref) || '';
        let value;
        if (raw.charAt(0) === '=') {
            // A cell that depends on itself, directly or through other cells.
            if (stack.has(ref)) return new SheetError('#CIRC!');
            stack.add(ref);
            try {
                value = evaluate(raw.slice(1), stack);
                if (Array.isArray(value)) value = new SheetError('#VALUE!');
            } catch (error) {
                value = error instanceof SheetError ? error : new SheetError('#ERROR!');
            }
            stack.delete(ref);
        } else {
            value = parseLiteral(raw);
        }

        cache.set(ref, value);
        return value;
    }

    function displayText(value) {
        if (value instanceof SheetError) return value.code;
        if (value === null) return '';
        if (typeof value === 'number') {
            if (!isFinite(value)) return '#NUM!';
            return String(Number(value.toPrecision(12)));
        }
        return value;
    }

    function cellInput(ref) {
        return sheetEl.querySelector('input[data-ref="' + ref + '"]');
    }

    function render() {
        cache.clear();
        const focused = document.activeElement;
        sheetEl.querySelectorAll('input[data-ref]').forEach((input) => {
            const ref = input.dataset.ref;
            const value = cellValue(ref, new Set());
            if (input === focused) {
                input.value = cells.get(ref) || '';
            } else {
                input.value = displayText(value);
            }
            input.classList.toggle('error', value instanceof SheetError);
            input.style.textAlign = typeof value === 'number' ? 'right' : 'left';
        });
        updateFormulaBar();
    }

    function updateFormulaBar() {
        const raw = cells.get(selected) || '';
        cellNameEl.textContent = selected;
        if (raw.charAt(0) === '=') {
            formulaBarEl.textContent = raw + '   →   ' + displayText(cellValue(selected, new Set()));
        } else {
            formulaBarEl.textContent = raw;
        }
    }

    function commit(ref, text) {
        const current = cells.get(ref) || '';
        if (text === current) return;
        if (text === '') {
            cells.delete(ref);
        } else {
            cells.set(ref, text);
        }
        render();
        save();
    }

    function focusCell(ref) {
        const input = cellInput(ref);
        if (input) {
            input.focus();
            input.select();
        }
    }

    function move(ref, dRow, dCol) {
        const { col, row } = parseRef(ref);
        const newCol = Math.min(COLS - 1, Math.max(0, col + dCol));
        const newRow = Math.min(ROWS, Math.max(1, row + dRow));
        focusCell(refKey(newCol, newRow));
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(cells)));
        } catch (error) {
            // Storage is full or blocked: the sheet still works, it just is not kept.
        }
    }

    function load() {
        try {
            const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            Object.keys(data).forEach((ref) => {
                if (typeof data[ref] === 'string') cells.set(ref, data[ref]);
            });
        } catch (error) {
            // Saved data is unreadable: start with an empty sheet.
        }
    }

    function buildGrid() {
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        headRow.appendChild(makeTh('', 'rowhead'));
        for (let col = 0; col < COLS; col++) {
            headRow.appendChild(makeTh(colName(col)));
        }
        thead.appendChild(headRow);

        const tbody = document.createElement('tbody');
        for (let row = 1; row <= ROWS; row++) {
            const tr = document.createElement('tr');
            tr.appendChild(makeTh(String(row), 'rowhead'));
            for (let col = 0; col < COLS; col++) {
                const ref = refKey(col, row);
                const td = document.createElement('td');
                const input = document.createElement('input');
                input.type = 'text';
                input.dataset.ref = ref;
                input.setAttribute('aria-label', 'Cell ' + ref);
                input.spellcheck = false;
                input.autocomplete = 'off';
                td.appendChild(input);
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        sheetEl.append(thead, tbody);
    }

    function makeTh(text, className) {
        const th = document.createElement('th');
        th.textContent = text;
        if (className) th.className = className;
        return th;
    }

    function setStatus(text) {
        statusEl.textContent = text;
    }

    sheetEl.addEventListener('focusin', (event) => {
        const ref = event.target.dataset && event.target.dataset.ref;
        if (!ref) return;
        selected = ref;
        event.target.value = cells.get(ref) || '';
        updateFormulaBar();
    });

    sheetEl.addEventListener('focusout', (event) => {
        const ref = event.target.dataset && event.target.dataset.ref;
        if (!ref) return;
        commit(ref, event.target.value);
    });

    sheetEl.addEventListener('keydown', (event) => {
        const ref = event.target.dataset && event.target.dataset.ref;
        if (!ref) return;
        if (event.key === 'Enter') {
            event.preventDefault();
            move(ref, 1, 0);
        } else if (event.key === 'Tab') {
            event.preventDefault();
            move(ref, 0, event.shiftKey ? -1 : 1);
        } else if (event.key === 'Escape') {
            event.target.value = cells.get(ref) || '';
            event.target.blur();
        }
    });

    document.getElementById('exampleBtn').addEventListener('click', () => {
        if (cells.size > 0 && !confirm('Replace the current sheet with the example?')) return;
        cells.clear();
        Object.keys(EXAMPLE).forEach((ref) => cells.set(ref, EXAMPLE[ref]));
        render();
        save();
        setStatus('Example loaded. Click a cell to see its formula.');
    });

    document.getElementById('clearBtn').addEventListener('click', () => {
        if (cells.size > 0 && !confirm('Clear every cell?')) return;
        cells.clear();
        render();
        save();
        setStatus('Sheet cleared.');
    });

    buildGrid();
    load();
    render();
})();
