export class LuaParser {
  constructor(src) {
    this.s = src;
    this.p = 0;
    this.n = src.length;
    // Pre-compiled sticky regexes — avoids O(n) substring copy on every call.
    this._reNum  = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    this._reWord = /[a-zA-Z_]\w*/y;
  }

  skipWS() {
    while (this.p < this.n) {
      const c = this.s[this.p];
      if (c === '-' && this.s[this.p + 1] === '-') {
        this.p += 2;
        while (this.p < this.n && this.s[this.p] !== '\n') this.p++;
      } else if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
        this.p++;
      } else {
        break;
      }
    }
  }

  parseString() {
    this.p++; // skip opening "
    let out = '';
    let start = this.p;
    while (this.p < this.n && this.s[this.p] !== '"') {
      if (this.s[this.p] === '\\') {
        out += this.s.slice(start, this.p); // flush non-escape chars in bulk
        this.p++;
        const e = this.s[this.p++];
        out += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e;
        start = this.p;
      } else {
        this.p++;
      }
    }
    out += this.s.slice(start, this.p); // flush remaining chars
    this.p++; // skip closing "
    return out;
  }

  // Sticky-regex versions avoid the O(n) substring copy on every call.
  parseNumber() {
    this._reNum.lastIndex = this.p;
    const m = this._reNum.exec(this.s);
    if (m) { this.p = this._reNum.lastIndex; return parseFloat(m[0]); }
    return 0;
  }

  parseWord() {
    this._reWord.lastIndex = this.p;
    const m = this._reWord.exec(this.s);
    if (m) { this.p = this._reWord.lastIndex; return m[0]; }
    return null;
  }

  parseValue() {
    this.skipWS();
    if (this.p >= this.n) return null;
    const c = this.s[this.p];
    if (c === '{') return this.parseTable();
    if (c === '"') return this.parseString();
    if (c === '-' || (c >= '0' && c <= '9')) return this.parseNumber();
    const saved = this.p;
    const w = this.parseWord();
    if (w === 'true')  return true;
    if (w === 'false') return false;
    if (w === 'nil')   return null;
    if (w) { this.p = saved; }
    return null;
  }

  parseTable() {
    this.p++; // skip {
    const obj = {};
    let ai = 1;
    while (true) {
      this.skipWS();
      if (this.p >= this.n || this.s[this.p] === '}') { this.p++; break; }
      if (this.s[this.p] === ',') { this.p++; continue; }

      if (this.s[this.p] === '[') {
        // Bracketed key: ["str"] or [num]
        this.p++;
        this.skipWS();
        const key = this.s[this.p] === '"' ? this.parseString() : this.parseNumber();
        this.skipWS();
        if (this.s[this.p] === ']') this.p++;
        this.skipWS();
        if (this.s[this.p] === '=') this.p++;
        obj[key] = this.parseValue();
      } else {
        // Bare word: either a key (word = value) or a positional value
        const saved = this.p;
        const w = this.parseWord();
        if (w && w !== 'true' && w !== 'false' && w !== 'nil') {
          this.skipWS();
          if (this.s[this.p] === '=') {
            this.p++;
            obj[w] = this.parseValue();
          } else {
            obj[ai++] = w; // bare word used as positional value
          }
        } else {
          this.p = saved; // restore and parse as value
          const v = this.parseValue();
          if (v !== null && v !== undefined) obj[ai++] = v;
          else this.p++; // skip unknown char
        }
      }
    }
    return obj;
  }

  // Entry point — parses one or more top-level `name = value` assignments
  parse() {
    const top = {};
    while (this.p < this.n) {
      this.skipWS();
      if (this.p >= this.n) break;
      const name = this.parseWord();
      if (!name) { this.p++; continue; }
      this.skipWS();
      if (this.s[this.p] === '=') {
        this.p++;
        top[name] = this.parseValue();
      }
    }
    return top;
  }
}
