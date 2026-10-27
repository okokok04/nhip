var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/viem/_esm/utils/data/isHex.js
function isHex(value, { strict = true } = {}) {
  if (!value)
    return false;
  if (typeof value !== "string")
    return false;
  return strict ? /^0x[0-9a-fA-F]*$/.test(value) : value.startsWith("0x");
}
var init_isHex = __esm({
  "node_modules/viem/_esm/utils/data/isHex.js"() {
  }
});

// node_modules/viem/_esm/utils/data/size.js
function size(value) {
  if (isHex(value, { strict: false }))
    return Math.ceil((value.length - 2) / 2);
  return value.length;
}
var init_size = __esm({
  "node_modules/viem/_esm/utils/data/size.js"() {
    init_isHex();
  }
});

// node_modules/viem/_esm/errors/version.js
var version;
var init_version = __esm({
  "node_modules/viem/_esm/errors/version.js"() {
    version = "2.57.11";
  }
});

// node_modules/viem/_esm/errors/base.js
function walk(err, fn) {
  if (fn?.(err))
    return err;
  if (err && typeof err === "object" && "cause" in err && err.cause !== void 0)
    return walk(err.cause, fn);
  return fn ? null : err;
}
var errorConfig, BaseError;
var init_base = __esm({
  "node_modules/viem/_esm/errors/base.js"() {
    init_version();
    errorConfig = {
      getDocsUrl: ({ docsBaseUrl, docsPath = "", docsSlug }) => docsPath ? `${docsBaseUrl ?? "https://viem.sh"}${docsPath}${docsSlug ? `#${docsSlug}` : ""}` : void 0,
      version: `viem@${version}`
    };
    BaseError = class _BaseError extends Error {
      constructor(shortMessage, args = {}) {
        const details = (() => {
          if (args.cause instanceof _BaseError)
            return args.cause.details;
          if (args.cause?.message)
            return args.cause.message;
          return args.details;
        })();
        const docsPath = (() => {
          if (args.cause instanceof _BaseError)
            return args.cause.docsPath || args.docsPath;
          return args.docsPath;
        })();
        const docsUrl = errorConfig.getDocsUrl?.({ ...args, docsPath });
        const message = [
          shortMessage || "An error occurred.",
          "",
          ...args.metaMessages ? [...args.metaMessages, ""] : [],
          ...docsUrl ? [`Docs: ${docsUrl}`] : [],
          ...details ? [`Details: ${details}`] : [],
          ...errorConfig.version ? [`Version: ${errorConfig.version}`] : []
        ].join("\n");
        super(message, args.cause ? { cause: args.cause } : void 0);
        Object.defineProperty(this, "details", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "docsPath", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "metaMessages", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "shortMessage", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "version", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "name", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: "BaseError"
        });
        this.details = details;
        this.docsPath = docsPath;
        this.metaMessages = args.metaMessages;
        this.name = args.name ?? this.name;
        this.shortMessage = shortMessage;
        this.version = version;
      }
      walk(fn) {
        return walk(this, fn);
      }
    };
  }
});

// node_modules/viem/_esm/errors/data.js
var SizeExceedsPaddingSizeError;
var init_data = __esm({
  "node_modules/viem/_esm/errors/data.js"() {
    init_base();
    SizeExceedsPaddingSizeError = class extends BaseError {
      constructor({ size: size2, targetSize, type }) {
        super(`${type.charAt(0).toUpperCase()}${type.slice(1).toLowerCase()} size (${size2}) exceeds padding size (${targetSize}).`, { name: "SizeExceedsPaddingSizeError" });
      }
    };
  }
});

// node_modules/viem/_esm/utils/data/pad.js
function pad(hexOrBytes, { dir, size: size2 = 32 } = {}) {
  if (typeof hexOrBytes === "string")
    return padHex(hexOrBytes, { dir, size: size2 });
  return padBytes(hexOrBytes, { dir, size: size2 });
}
function padHex(hex_, { dir, size: size2 = 32 } = {}) {
  if (size2 === null)
    return hex_;
  const hex = hex_.replace("0x", "");
  if (hex.length > size2 * 2)
    throw new SizeExceedsPaddingSizeError({
      size: Math.ceil(hex.length / 2),
      targetSize: size2,
      type: "hex"
    });
  return `0x${hex[dir === "right" ? "padEnd" : "padStart"](size2 * 2, "0")}`;
}
function padBytes(bytes, { dir, size: size2 = 32 } = {}) {
  if (size2 === null)
    return bytes;
  if (bytes.length > size2)
    throw new SizeExceedsPaddingSizeError({
      size: bytes.length,
      targetSize: size2,
      type: "bytes"
    });
  const paddedBytes = new Uint8Array(size2);
  for (let i = 0; i < size2; i++) {
    const padEnd = dir === "right";
    paddedBytes[padEnd ? i : size2 - i - 1] = bytes[padEnd ? i : bytes.length - i - 1];
  }
  return paddedBytes;
}
var init_pad = __esm({
  "node_modules/viem/_esm/utils/data/pad.js"() {
    init_data();
  }
});

// node_modules/viem/_esm/errors/encoding.js
var IntegerOutOfRangeError, SizeOverflowError;
var init_encoding = __esm({
  "node_modules/viem/_esm/errors/encoding.js"() {
    init_base();
    IntegerOutOfRangeError = class extends BaseError {
      constructor({ max, min, signed, size: size2, value }) {
        super(`Number "${value}" is not in safe ${size2 ? `${size2 * 8}-bit ${signed ? "signed" : "unsigned"} ` : ""}integer range ${max ? `(${min} to ${max})` : `(above ${min})`}`, { name: "IntegerOutOfRangeError" });
      }
    };
    SizeOverflowError = class extends BaseError {
      constructor({ givenSize, maxSize }) {
        super(`Size cannot exceed ${maxSize} bytes. Given size: ${givenSize} bytes.`, { name: "SizeOverflowError" });
      }
    };
  }
});

// node_modules/viem/_esm/utils/encoding/fromHex.js
function assertSize(hexOrBytes, { size: size2 }) {
  if (size(hexOrBytes) > size2)
    throw new SizeOverflowError({
      givenSize: size(hexOrBytes),
      maxSize: size2
    });
}
var init_fromHex = __esm({
  "node_modules/viem/_esm/utils/encoding/fromHex.js"() {
    init_encoding();
    init_size();
  }
});

// node_modules/viem/_esm/utils/encoding/toHex.js
function toHex(value, opts = {}) {
  if (typeof value === "number" || typeof value === "bigint")
    return numberToHex(value, opts);
  if (typeof value === "string") {
    return stringToHex(value, opts);
  }
  if (typeof value === "boolean")
    return boolToHex(value, opts);
  return bytesToHex(value, opts);
}
function boolToHex(value, opts = {}) {
  const hex = `0x${Number(value)}`;
  if (typeof opts.size === "number") {
    assertSize(hex, { size: opts.size });
    return pad(hex, { size: opts.size });
  }
  return hex;
}
function bytesToHex(value, opts = {}) {
  let string = "";
  for (let i = 0; i < value.length; i++) {
    string += hexes[value[i]];
  }
  const hex = `0x${string}`;
  if (typeof opts.size === "number") {
    assertSize(hex, { size: opts.size });
    return pad(hex, { dir: "right", size: opts.size });
  }
  return hex;
}
function numberToHex(value_, opts = {}) {
  const { signed, size: size2 } = opts;
  const value = BigInt(value_);
  let maxValue;
  if (size2) {
    if (signed)
      maxValue = (1n << BigInt(size2) * 8n - 1n) - 1n;
    else
      maxValue = 2n ** (BigInt(size2) * 8n) - 1n;
  } else if (typeof value_ === "number") {
    maxValue = BigInt(Number.MAX_SAFE_INTEGER);
  }
  const minValue = typeof maxValue === "bigint" && signed ? -maxValue - 1n : 0;
  if (maxValue && value > maxValue || value < minValue) {
    const suffix = typeof value_ === "bigint" ? "n" : "";
    throw new IntegerOutOfRangeError({
      max: maxValue ? `${maxValue}${suffix}` : void 0,
      min: `${minValue}${suffix}`,
      signed,
      size: size2,
      value: `${value_}${suffix}`
    });
  }
  const hex = `0x${(signed && value < 0 ? (1n << BigInt(size2 * 8)) + BigInt(value) : value).toString(16)}`;
  if (size2)
    return pad(hex, { size: size2 });
  return hex;
}
function stringToHex(value_, opts = {}) {
  const value = encoder.encode(value_);
  return bytesToHex(value, opts);
}
var hexes, encoder;
var init_toHex = __esm({
  "node_modules/viem/_esm/utils/encoding/toHex.js"() {
    init_encoding();
    init_pad();
    init_fromHex();
    hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_v, i) => i.toString(16).padStart(2, "0"));
    encoder = /* @__PURE__ */ new TextEncoder();
  }
});

// node_modules/viem/_esm/utils/encoding/toBytes.js
function toBytes(value, opts = {}) {
  if (typeof value === "number" || typeof value === "bigint")
    return numberToBytes(value, opts);
  if (typeof value === "boolean")
    return boolToBytes(value, opts);
  if (isHex(value))
    return hexToBytes(value, opts);
  return stringToBytes(value, opts);
}
function boolToBytes(value, opts = {}) {
  const bytes = new Uint8Array(1);
  bytes[0] = Number(value);
  if (typeof opts.size === "number") {
    assertSize(bytes, { size: opts.size });
    return pad(bytes, { size: opts.size });
  }
  return bytes;
}
function charCodeToBase16(char) {
  if (char >= charCodeMap.zero && char <= charCodeMap.nine)
    return char - charCodeMap.zero;
  if (char >= charCodeMap.A && char <= charCodeMap.F)
    return char - (charCodeMap.A - 10);
  if (char >= charCodeMap.a && char <= charCodeMap.f)
    return char - (charCodeMap.a - 10);
  return void 0;
}
function hexToBytes(hex_, opts = {}) {
  let hex = hex_;
  if (opts.size) {
    assertSize(hex, { size: opts.size });
    hex = pad(hex, { dir: "right", size: opts.size });
  }
  let hexString = hex.slice(2);
  if (hexString.length % 2)
    hexString = `0${hexString}`;
  const length = hexString.length / 2;
  const bytes = new Uint8Array(length);
  for (let index = 0, j = 0; index < length; index++) {
    const nibbleLeft = charCodeToBase16(hexString.charCodeAt(j++));
    const nibbleRight = charCodeToBase16(hexString.charCodeAt(j++));
    if (nibbleLeft === void 0 || nibbleRight === void 0) {
      throw new BaseError(`Invalid byte sequence ("${hexString[j - 2]}${hexString[j - 1]}" in "${hexString}").`);
    }
    bytes[index] = nibbleLeft * 16 + nibbleRight;
  }
  return bytes;
}
function numberToBytes(value, opts) {
  const hex = numberToHex(value, opts);
  return hexToBytes(hex);
}
function stringToBytes(value, opts = {}) {
  const bytes = encoder2.encode(value);
  if (typeof opts.size === "number") {
    assertSize(bytes, { size: opts.size });
    return pad(bytes, { dir: "right", size: opts.size });
  }
  return bytes;
}
var encoder2, charCodeMap;
var init_toBytes = __esm({
  "node_modules/viem/_esm/utils/encoding/toBytes.js"() {
    init_base();
    init_isHex();
    init_pad();
    init_fromHex();
    init_toHex();
    encoder2 = /* @__PURE__ */ new TextEncoder();
    charCodeMap = {
      zero: 48,
      nine: 57,
      A: 65,
      F: 70,
      a: 97,
      f: 102
    };
  }
});

// node_modules/@noble/hashes/esm/_u64.js
function fromBig(n, le = false) {
  if (le)
    return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
  return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
var U32_MASK64, _32n, rotlSH, rotlSL, rotlBH, rotlBL;
var init_u64 = __esm({
  "node_modules/@noble/hashes/esm/_u64.js"() {
    U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
    _32n = /* @__PURE__ */ BigInt(32);
    rotlSH = (h, l, s) => h << s | l >>> 32 - s;
    rotlSL = (h, l, s) => l << s | h >>> 32 - s;
    rotlBH = (h, l, s) => l << s - 32 | h >>> 64 - s;
    rotlBL = (h, l, s) => h << s - 32 | l >>> 64 - s;
  }
});

// node_modules/@noble/hashes/esm/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("positive integer expected, got " + n);
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function u32(arr) {
  return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function byteSwap(word) {
  return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
}
function byteSwap32(arr) {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = byteSwap(arr[i]);
  }
  return arr;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes2(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes2(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
var isLE, swap32IfBE, Hash;
var init_utils = __esm({
  "node_modules/@noble/hashes/esm/utils.js"() {
    isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
    swap32IfBE = isLE ? (u) => u : byteSwap32;
    Hash = class {
    };
  }
});

// node_modules/@noble/hashes/esm/sha3.js
function keccakP(s, rounds = 24) {
  const B = new Uint32Array(5 * 2);
  for (let round = 24 - rounds; round < 24; round++) {
    for (let x = 0; x < 10; x++)
      B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
    for (let x = 0; x < 10; x += 2) {
      const idx1 = (x + 8) % 10;
      const idx0 = (x + 2) % 10;
      const B0 = B[idx0];
      const B1 = B[idx0 + 1];
      const Th = rotlH(B0, B1, 1) ^ B[idx1];
      const Tl = rotlL(B0, B1, 1) ^ B[idx1 + 1];
      for (let y = 0; y < 50; y += 10) {
        s[x + y] ^= Th;
        s[x + y + 1] ^= Tl;
      }
    }
    let curH = s[2];
    let curL = s[3];
    for (let t = 0; t < 24; t++) {
      const shift = SHA3_ROTL[t];
      const Th = rotlH(curH, curL, shift);
      const Tl = rotlL(curH, curL, shift);
      const PI = SHA3_PI[t];
      curH = s[PI];
      curL = s[PI + 1];
      s[PI] = Th;
      s[PI + 1] = Tl;
    }
    for (let y = 0; y < 50; y += 10) {
      for (let x = 0; x < 10; x++)
        B[x] = s[y + x];
      for (let x = 0; x < 10; x++)
        s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
    }
    s[0] ^= SHA3_IOTA_H[round];
    s[1] ^= SHA3_IOTA_L[round];
  }
  clean(B);
}
var _0n, _1n, _2n, _7n, _256n, _0x71n, SHA3_PI, SHA3_ROTL, _SHA3_IOTA, IOTAS, SHA3_IOTA_H, SHA3_IOTA_L, rotlH, rotlL, Keccak, gen, keccak_256;
var init_sha3 = __esm({
  "node_modules/@noble/hashes/esm/sha3.js"() {
    init_u64();
    init_utils();
    _0n = BigInt(0);
    _1n = BigInt(1);
    _2n = BigInt(2);
    _7n = BigInt(7);
    _256n = BigInt(256);
    _0x71n = BigInt(113);
    SHA3_PI = [];
    SHA3_ROTL = [];
    _SHA3_IOTA = [];
    for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
      [x, y] = [y, (2 * x + 3 * y) % 5];
      SHA3_PI.push(2 * (5 * y + x));
      SHA3_ROTL.push((round + 1) * (round + 2) / 2 % 64);
      let t = _0n;
      for (let j = 0; j < 7; j++) {
        R = (R << _1n ^ (R >> _7n) * _0x71n) % _256n;
        if (R & _2n)
          t ^= _1n << (_1n << /* @__PURE__ */ BigInt(j)) - _1n;
      }
      _SHA3_IOTA.push(t);
    }
    IOTAS = split(_SHA3_IOTA, true);
    SHA3_IOTA_H = IOTAS[0];
    SHA3_IOTA_L = IOTAS[1];
    rotlH = (h, l, s) => s > 32 ? rotlBH(h, l, s) : rotlSH(h, l, s);
    rotlL = (h, l, s) => s > 32 ? rotlBL(h, l, s) : rotlSL(h, l, s);
    Keccak = class _Keccak extends Hash {
      // NOTE: we accept arguments in bytes instead of bits here.
      constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
        super();
        this.pos = 0;
        this.posOut = 0;
        this.finished = false;
        this.destroyed = false;
        this.enableXOF = false;
        this.blockLen = blockLen;
        this.suffix = suffix;
        this.outputLen = outputLen;
        this.enableXOF = enableXOF;
        this.rounds = rounds;
        anumber(outputLen);
        if (!(0 < blockLen && blockLen < 200))
          throw new Error("only keccak-f1600 function is supported");
        this.state = new Uint8Array(200);
        this.state32 = u32(this.state);
      }
      clone() {
        return this._cloneInto();
      }
      keccak() {
        swap32IfBE(this.state32);
        keccakP(this.state32, this.rounds);
        swap32IfBE(this.state32);
        this.posOut = 0;
        this.pos = 0;
      }
      update(data) {
        aexists(this);
        data = toBytes2(data);
        abytes(data);
        const { blockLen, state } = this;
        const len = data.length;
        for (let pos = 0; pos < len; ) {
          const take = Math.min(blockLen - this.pos, len - pos);
          for (let i = 0; i < take; i++)
            state[this.pos++] ^= data[pos++];
          if (this.pos === blockLen)
            this.keccak();
        }
        return this;
      }
      finish() {
        if (this.finished)
          return;
        this.finished = true;
        const { state, suffix, pos, blockLen } = this;
        state[pos] ^= suffix;
        if ((suffix & 128) !== 0 && pos === blockLen - 1)
          this.keccak();
        state[blockLen - 1] ^= 128;
        this.keccak();
      }
      writeInto(out) {
        aexists(this, false);
        abytes(out);
        this.finish();
        const bufferOut = this.state;
        const { blockLen } = this;
        for (let pos = 0, len = out.length; pos < len; ) {
          if (this.posOut >= blockLen)
            this.keccak();
          const take = Math.min(blockLen - this.posOut, len - pos);
          out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
          this.posOut += take;
          pos += take;
        }
        return out;
      }
      xofInto(out) {
        if (!this.enableXOF)
          throw new Error("XOF is not possible for this instance");
        return this.writeInto(out);
      }
      xof(bytes) {
        anumber(bytes);
        return this.xofInto(new Uint8Array(bytes));
      }
      digestInto(out) {
        aoutput(out, this);
        if (this.finished)
          throw new Error("digest() was already called");
        this.writeInto(out);
        this.destroy();
        return out;
      }
      digest() {
        return this.digestInto(new Uint8Array(this.outputLen));
      }
      destroy() {
        this.destroyed = true;
        clean(this.state);
      }
      _cloneInto(to) {
        const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
        to || (to = new _Keccak(blockLen, suffix, outputLen, enableXOF, rounds));
        to.state32.set(this.state32);
        to.pos = this.pos;
        to.posOut = this.posOut;
        to.finished = this.finished;
        to.rounds = rounds;
        to.suffix = suffix;
        to.outputLen = outputLen;
        to.enableXOF = enableXOF;
        to.destroyed = this.destroyed;
        return to;
      }
    };
    gen = (suffix, blockLen, outputLen) => createHasher(() => new Keccak(blockLen, suffix, outputLen));
    keccak_256 = /* @__PURE__ */ (() => gen(1, 136, 256 / 8))();
  }
});

// node_modules/viem/_esm/utils/hash/keccak256.js
function keccak256(value, to_) {
  const to = to_ || "hex";
  const bytes = keccak_256(isHex(value, { strict: false }) ? toBytes(value) : value);
  if (to === "bytes")
    return bytes;
  return toHex(bytes);
}
var init_keccak256 = __esm({
  "node_modules/viem/_esm/utils/hash/keccak256.js"() {
    init_sha3();
    init_isHex();
    init_toBytes();
    init_toHex();
  }
});

// node_modules/viem/_esm/errors/address.js
var InvalidAddressError;
var init_address = __esm({
  "node_modules/viem/_esm/errors/address.js"() {
    init_base();
    InvalidAddressError = class extends BaseError {
      constructor({ address }) {
        super(`Address "${address}" is invalid.`, {
          metaMessages: [
            "- Address must be a hex value of 20 bytes (40 hex characters).",
            "- Address must match its checksum counterpart."
          ],
          name: "InvalidAddressError"
        });
      }
    };
  }
});

// node_modules/viem/_esm/utils/lru.js
var LruMap;
var init_lru = __esm({
  "node_modules/viem/_esm/utils/lru.js"() {
    LruMap = class extends Map {
      constructor(size2) {
        super();
        Object.defineProperty(this, "maxSize", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        this.maxSize = size2;
      }
      get(key) {
        const value = super.get(key);
        if (super.has(key)) {
          super.delete(key);
          super.set(key, value);
        }
        return value;
      }
      set(key, value) {
        if (super.has(key))
          super.delete(key);
        super.set(key, value);
        if (this.maxSize && this.size > this.maxSize) {
          const firstKey = super.keys().next().value;
          if (firstKey !== void 0)
            super.delete(firstKey);
        }
        return this;
      }
    };
  }
});

// node_modules/viem/_esm/utils/address/getAddress.js
function checksumAddress(address_, chainId) {
  if (checksumAddressCache.has(`${address_}.${chainId}`))
    return checksumAddressCache.get(`${address_}.${chainId}`);
  const hexAddress = chainId ? `${chainId}${address_.toLowerCase()}` : address_.substring(2).toLowerCase();
  const hash = keccak256(stringToBytes(hexAddress), "bytes");
  const address = (chainId ? hexAddress.substring(`${chainId}0x`.length) : hexAddress).split("");
  for (let i = 0; i < 40; i += 2) {
    if (hash[i >> 1] >> 4 >= 8 && address[i]) {
      address[i] = address[i].toUpperCase();
    }
    if ((hash[i >> 1] & 15) >= 8 && address[i + 1]) {
      address[i + 1] = address[i + 1].toUpperCase();
    }
  }
  const result = `0x${address.join("")}`;
  checksumAddressCache.set(`${address_}.${chainId}`, result);
  return result;
}
function getAddress(address, chainId) {
  if (!isAddress(address, { strict: false }))
    throw new InvalidAddressError({ address });
  return checksumAddress(address, chainId);
}
var checksumAddressCache;
var init_getAddress = __esm({
  "node_modules/viem/_esm/utils/address/getAddress.js"() {
    init_address();
    init_toBytes();
    init_keccak256();
    init_lru();
    init_isAddress();
    checksumAddressCache = /* @__PURE__ */ new LruMap(8192);
  }
});

// node_modules/viem/_esm/utils/address/isAddress.js
function isAddress(address, options) {
  const { strict = true } = options ?? {};
  const cacheKey2 = `${address}.${strict}`;
  if (isAddressCache.has(cacheKey2))
    return isAddressCache.get(cacheKey2);
  const result = (() => {
    if (!addressRegex.test(address))
      return false;
    if (address.toLowerCase() === address)
      return true;
    if (strict)
      return checksumAddress(address) === address;
    return true;
  })();
  isAddressCache.set(cacheKey2, result);
  return result;
}
var addressRegex, isAddressCache;
var init_isAddress = __esm({
  "node_modules/viem/_esm/utils/address/isAddress.js"() {
    init_lru();
    init_getAddress();
    addressRegex = /^0x[a-fA-F0-9]{40}$/;
    isAddressCache = /* @__PURE__ */ new LruMap(8192);
  }
});

// packages/db/src/client.ts
var DatabaseError;
var init_client = __esm({
  "packages/db/src/client.ts"() {
    "use strict";
    DatabaseError = class extends Error {
      code;
      constructor(message, code) {
        super(message);
        this.name = "DatabaseError";
        this.code = code;
      }
    };
  }
});

// packages/db/src/pglite.ts
var pglite_exports = {};
__export(pglite_exports, {
  PgliteDatabase: () => PgliteDatabase
});
import { mkdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
function wrapError(error) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : void 0;
  const message = error instanceof Error ? error.message : String(error);
  return new DatabaseError(message, code);
}
var PgliteDatabase;
var init_pglite = __esm({
  "packages/db/src/pglite.ts"() {
    "use strict";
    init_client();
    PgliteDatabase = class _PgliteDatabase {
      #db;
      /** Hàng đợi transaction — xem giải thích trong `transaction()`. */
      #txQueue = Promise.resolve();
      constructor(db) {
        this.#db = db;
      }
      static async create(options = {}) {
        if (!options.dataDir || options.dataDir === "memory://") {
          const db2 = new PGlite();
          await db2.waitReady;
          return new _PgliteDatabase(db2);
        }
        await mkdir(options.dataDir, { recursive: true });
        const db = new PGlite(options.dataDir);
        await db.waitReady;
        return new _PgliteDatabase(db);
      }
      async query(sql, params = []) {
        try {
          const result = await this.#db.query(sql, params);
          return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
        } catch (error) {
          throw wrapError(error);
        }
      }
      async exec(sql) {
        try {
          await this.#db.exec(sql);
        } catch (error) {
          throw wrapError(error);
        }
      }
      async transaction(fn) {
        const previous = this.#txQueue;
        let release;
        this.#txQueue = new Promise((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          await this.#db.exec("BEGIN");
          try {
            const result = await fn(this);
            await this.#db.exec("COMMIT");
            return result;
          } catch (error) {
            await this.#db.exec("ROLLBACK");
            throw error;
          }
        } finally {
          release();
        }
      }
      async close() {
        await this.#db.close();
      }
    };
  }
});

// node_modules/@hono/node-server/dist/constants-BLSFu_RU.mjs
var X_ALREADY_SENT = "x-hono-already-sent";

// node_modules/@hono/node-server/dist/index.mjs
import { STATUS_CODES, ServerResponse, createServer } from "node:http";
import { Http2ServerRequest, constants } from "node:http2";
import { Readable } from "node:stream";

// node_modules/hono/dist/helper/websocket/index.js
var defineWebSocketHelper = (handler2) => {
  return ((...args) => {
    if (typeof args[0] === "function") {
      const [createEvents, options] = args;
      return async function upgradeWebSocket2(c, next) {
        const result = await handler2(c, await createEvents(c), options);
        if (result) return result;
        await next();
      };
    } else {
      const [c, events, options] = args;
      return (async () => {
        const upgraded = await handler2(c, events, options);
        if (!upgraded) throw new Error("Failed to upgrade WebSocket");
        return upgraded;
      })();
    }
  });
};

// node_modules/@hono/node-server/dist/index.mjs
var RequestError = class extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "RequestError";
  }
};
var nonJoinedHeaders = /* @__PURE__ */ new Set([
  "age",
  "authorization",
  "content-length",
  "content-type",
  "etag",
  "expires",
  "from",
  "host",
  "if-modified-since",
  "if-unmodified-since",
  "last-modified",
  "location",
  "max-forwards",
  "proxy-authorization",
  "referer",
  "retry-after",
  "server",
  "user-agent"
]);
var validHeaderName = /^[!#$%&'*+\-.^_`|~\dA-Za-z]+$/;
var isHttpWhitespace = (code) => code === 9 || code === 10 || code === 13 || code === 32;
var normalizeHeaderValue = (value) => {
  if (!isHttpWhitespace(value.charCodeAt(0)) && !isHttpWhitespace(value.charCodeAt(value.length - 1))) return value;
  let start = 0;
  let end = value.length;
  while (start < end && isHttpWhitespace(value.charCodeAt(start))) start++;
  while (end > start && isHttpWhitespace(value.charCodeAt(end - 1))) end--;
  return value.slice(start, end);
};
var forbiddenHeaderValue = /[\0\r\n]/;
var GlobalHeaders = globalThis.Headers;
var materializeHeaders = (rawHeaders, HeadersCtor = GlobalHeaders) => {
  const headers = new HeadersCtor();
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i];
    if (!name.startsWith(":")) headers.append(name, rawHeaders[i + 1]);
  }
  return headers;
};
var RequestHeaders = class {
  #incoming;
  #rawHeaders;
  #headers;
  #invalidValue;
  constructor(incoming) {
    this.#incoming = incoming;
    if (incoming instanceof Http2ServerRequest) this.#rawHeaders = incoming.rawHeaders.slice();
  }
  get #lazyRawHeaders() {
    return this.#rawHeaders ??= this.#incoming.rawHeaders.slice();
  }
  get #native() {
    if (!this.#headers) {
      this.#headers = materializeHeaders(this.#lazyRawHeaders);
      this.#rawHeaders = void 0;
    }
    return this.#headers;
  }
  #normalizedName(name) {
    if (typeof name !== "string") return;
    if (!validHeaderName.test(name)) throw new TypeError(`Invalid header name: ${name}`);
    return name.toLowerCase();
  }
  #lookupHttp1(lowerName) {
    const headers = this.#incoming instanceof Http2ServerRequest ? void 0 : this.#incoming.headers;
    if (!headers || nonJoinedHeaders.has(lowerName) || lowerName === "set-cookie" || lowerName === "__proto__") return;
    if (!Object.hasOwn(headers, lowerName)) return null;
    const rawValue = headers[lowerName];
    if (typeof rawValue === "string") {
      const value = normalizeHeaderValue(rawValue);
      return forbiddenHeaderValue.test(value) ? void 0 : value;
    }
  }
  #lookup(rawHeaders, lowerName) {
    const separator = lowerName === "cookie" ? "; " : ", ";
    let value = null;
    for (let i = 0; i < rawHeaders.length; i += 2) {
      const rawName = rawHeaders[i];
      if (rawName.length === lowerName.length && rawName.toLowerCase() === lowerName) {
        const rawValue = normalizeHeaderValue(rawHeaders[i + 1]);
        if (forbiddenHeaderValue.test(rawValue)) {
          this.#invalidValue = true;
          return;
        }
        value = value === null ? rawValue : value + separator + rawValue;
      }
    }
    return value;
  }
  append(name, value) {
    this.#native.append(name, value);
  }
  delete(name) {
    this.#native.delete(name);
  }
  get(name) {
    const lowerName = this.#normalizedName(name);
    if (lowerName && !this.#headers && !this.#invalidValue) {
      const http1Value = this.#lookupHttp1(lowerName);
      if (http1Value !== void 0) return http1Value;
      const value = this.#lookup(this.#lazyRawHeaders, lowerName);
      if (value !== void 0) return value;
    }
    return this.#native.get(name);
  }
  has(name) {
    const lowerName = this.#normalizedName(name);
    if (lowerName && !this.#headers && !this.#invalidValue) {
      const http1Value = this.#lookupHttp1(lowerName);
      if (http1Value !== void 0) return http1Value !== null;
      const value = this.#lookup(this.#lazyRawHeaders, lowerName);
      if (value !== void 0) return value !== null;
    }
    return this.#native.has(name);
  }
  set(name, value) {
    this.#native.set(name, value);
  }
  getSetCookie() {
    return this.#native.getSetCookie();
  }
  keys() {
    return this.#native.keys();
  }
  values() {
    return this.#native.values();
  }
  entries() {
    return this.#native.entries();
  }
  forEach(callback, thisArg) {
    this.#native.forEach((value, key) => {
      callback.call(thisArg, value, key, this);
    });
  }
  [Symbol.iterator]() {
    return this.entries();
  }
};
Object.defineProperty(RequestHeaders.prototype, /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
  return `Headers (lightweight) ${inspectFn(Object.fromEntries(this), {
    ...options,
    depth: depth == null ? null : depth - 1
  })}`;
} });
Object.setPrototypeOf(RequestHeaders.prototype, GlobalHeaders.prototype);
var newHeadersFromIncoming = (incoming) => globalThis.Headers === GlobalHeaders ? new RequestHeaders(incoming) : materializeHeaders(incoming.rawHeaders, globalThis.Headers);
var reValidRequestUrl = /^\/[!#$&-;=?-\[\]_a-z~]*$/;
var reDotSegment = /\/\.\.?(?:[/?#]|$)/;
var reValidHost = /^[a-z0-9._-]+(?::(?:[1-5]\d{3,4}|[6-9]\d{3}))?$/;
var buildUrl = (scheme, host, incomingUrl) => {
  const url = `${scheme}://${host}${incomingUrl}`;
  if (!reValidHost.test(host)) {
    const urlObj = new URL(url);
    if (urlObj.hostname.length !== host.length && urlObj.hostname !== (host.includes(":") ? host.replace(/:\d+$/, "") : host).toLowerCase()) throw new RequestError("Invalid host header");
    return urlObj.href;
  } else if (incomingUrl.length === 0) return url + "/";
  else {
    if (incomingUrl.charCodeAt(0) !== 47) throw new RequestError("Invalid URL");
    if (!reValidRequestUrl.test(incomingUrl) || reDotSegment.test(incomingUrl)) return new URL(url).href;
    return url;
  }
};
var toRequestError = (e) => {
  if (e instanceof RequestError) return e;
  return new RequestError(e.message, { cause: e });
};
var GlobalRequest = global.Request;
var Request$1 = class extends GlobalRequest {
  constructor(input, options) {
    if (typeof input === "object" && getRequestCache in input) {
      const hasReplacementBody = options !== void 0 && "body" in options && options.body != null;
      if (input[bodyConsumedDirectlyKey] && !hasReplacementBody) throw new TypeError("Cannot construct a Request with a Request object that has already been used.");
      input = input[getRequestCache]();
    }
    if (typeof options?.body?.getReader !== "undefined") options.duplex ??= "half";
    super(input, options);
  }
};
var wrapBodyStream = /* @__PURE__ */ Symbol("wrapBodyStream");
var byteExactEncodings = /* @__PURE__ */ new Set([
  "latin1",
  "binary",
  "hex",
  "base64",
  "base64url"
]);
var isByteExactEncoding = (encoding) => encoding === null || byteExactEncodings.has(encoding);
var bodyBufferedBeforeDisconnectKey = /* @__PURE__ */ Symbol("bodyBufferedBeforeDisconnect");
var bodyBufferedLengthBeforeDisconnectKey = /* @__PURE__ */ Symbol("bodyBufferedLengthBeforeDisconnect");
var toBufferChunk = (chunk, encoding) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding ?? "utf8");
var isRecoverableDisconnectedIncoming = (incoming) => !(incoming instanceof Http2ServerRequest) && !!incoming.complete && !!incoming.readableAborted && typeof incoming.read === "function" && isByteExactEncoding(incoming.readableEncoding);
var recordBodyBufferedBeforeDisconnect = (incoming) => {
  if (incoming.readableDidRead || !isRecoverableDisconnectedIncoming(incoming)) return;
  const incomingWithRecovery = incoming;
  incomingWithRecovery[bodyBufferedLengthBeforeDisconnectKey] ??= incoming.readableLength;
};
var readBodyBufferedBeforeDisconnect = (incoming, chunks) => {
  if (incoming.readableDidRead && !chunks || !isRecoverableDisconnectedIncoming(incoming)) return;
  const incomingWithRecovery = incoming;
  if (incomingWithRecovery[bodyBufferedBeforeDisconnectKey] !== void 0) return incomingWithRecovery[bodyBufferedBeforeDisconnectKey];
  let result;
  const errored = incoming.errored;
  if (errored && errored.code !== "ECONNRESET") result = errored;
  else if (incomingWithRecovery[bodyBufferedLengthBeforeDisconnectKey] !== void 0 && incoming.readableLength !== incomingWithRecovery[bodyBufferedLengthBeforeDisconnectKey]) result = newBodyUnusableError();
  else {
    const bodyChunks = chunks ?? [];
    const chunk = incoming.read();
    if (chunk !== null) bodyChunks.push(toBufferChunk(chunk, incoming.readableEncoding));
    const buffer = bodyChunks.length === 1 ? bodyChunks[0] : Buffer.concat(bodyChunks);
    result = buffer;
    const contentLength = incoming.headers["content-length"];
    if (typeof contentLength === "string" && /^\d+$/.test(contentLength)) {
      const expectedLength = Number(contentLength);
      if (Number.isSafeInteger(expectedLength) && buffer.length !== expectedLength) result = newBodyUnusableError();
    }
  }
  incomingWithRecovery[bodyBufferedBeforeDisconnectKey] = result;
  return result;
};
var enqueueBufferedBody = (controller, buffered) => {
  if (buffered instanceof Error) {
    controller.error(buffered);
    return;
  }
  if (buffered.length > 0) controller.enqueue(buffered);
  controller.close();
};
var newRequestFromIncoming = (method, url, headers, incoming, abortController) => {
  const init = {
    method,
    headers,
    signal: abortController.signal
  };
  if (method === "TRACE") {
    init.method = "GET";
    const req = new Request$1(url, init);
    Object.defineProperty(req, "method", { get() {
      return "TRACE";
    } });
    return req;
  }
  if (!(method === "GET" || method === "HEAD")) if ("rawBody" in incoming && incoming.rawBody instanceof Buffer) init.body = new ReadableStream({ start(controller) {
    controller.enqueue(incoming.rawBody);
    controller.close();
  } });
  else if (incoming[wrapBodyStream]) {
    let reader;
    init.body = new ReadableStream({ async pull(controller) {
      try {
        if (!reader) {
          const buffered = readBodyBufferedBeforeDisconnect(incoming);
          if (buffered !== void 0) {
            enqueueBufferedBody(controller, buffered);
            return;
          }
        }
        reader ||= Readable.toWeb(incoming).getReader();
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    } });
  } else {
    const buffered = readBodyBufferedBeforeDisconnect(incoming);
    if (buffered !== void 0) init.body = new ReadableStream({ start(controller) {
      enqueueBufferedBody(controller, buffered);
    } });
    else init.body = Readable.toWeb(incoming);
  }
  return new Request$1(url, init);
};
var getRequestCache = /* @__PURE__ */ Symbol("getRequestCache");
var requestCache = /* @__PURE__ */ Symbol("requestCache");
var incomingKey = /* @__PURE__ */ Symbol("incomingKey");
var urlKey = /* @__PURE__ */ Symbol("urlKey");
var methodKey = /* @__PURE__ */ Symbol("methodKey");
var headersKey = /* @__PURE__ */ Symbol("headersKey");
var abortControllerKey = /* @__PURE__ */ Symbol("abortControllerKey");
var getAbortController = /* @__PURE__ */ Symbol("getAbortController");
var abortRequest = /* @__PURE__ */ Symbol("abortRequest");
var bodyBufferKey = /* @__PURE__ */ Symbol("bodyBuffer");
var bodyReadPromiseKey = /* @__PURE__ */ Symbol("bodyReadPromise");
var bodyConsumedDirectlyKey = /* @__PURE__ */ Symbol("bodyConsumedDirectly");
var bodyLockReaderKey = /* @__PURE__ */ Symbol("bodyLockReader");
var abortReasonKey = /* @__PURE__ */ Symbol("abortReason");
var newBodyUnusableError = () => {
  return /* @__PURE__ */ new TypeError("Body is unusable");
};
var rejectBodyUnusable = () => {
  return Promise.reject(newBodyUnusableError());
};
var textDecoder = new TextDecoder();
var consumeBodyDirectOnce = (request) => {
  if (request[bodyConsumedDirectlyKey]) return rejectBodyUnusable();
  request[bodyConsumedDirectlyKey] = true;
};
var toArrayBuffer = (buf) => {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};
var contentType = (request) => {
  return (request[headersKey] ||= newHeadersFromIncoming(request[incomingKey])).get("content-type") || "";
};
var methodTokenRegExp = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
var normalizeIncomingMethod = (method) => {
  if (typeof method !== "string" || method.length === 0) return "GET";
  switch (method) {
    case "DELETE":
    case "GET":
    case "HEAD":
    case "OPTIONS":
    case "PATCH":
    case "POST":
    case "PUT":
    case "QUERY":
      return method;
  }
  const upper = method.toUpperCase();
  switch (upper) {
    case "DELETE":
    case "GET":
    case "HEAD":
    case "OPTIONS":
    case "POST":
    case "PUT":
      return upper;
    default:
      return method;
  }
};
var validateDirectReadMethod = (method) => {
  if (!methodTokenRegExp.test(method)) return /* @__PURE__ */ new TypeError(`'${method}' is not a valid HTTP method.`);
  const normalized = method.toUpperCase();
  if (normalized === "CONNECT" || normalized === "TRACK" || normalized === "TRACE" && method !== "TRACE") return /* @__PURE__ */ new TypeError(`'${method}' HTTP method is unsupported.`);
};
var readBodyWithFastPath = (request, method, fromBuffer) => {
  if (request[bodyConsumedDirectlyKey]) return rejectBodyUnusable();
  const methodName = request.method;
  if (methodName === "GET" || methodName === "HEAD") return request[getRequestCache]()[method]();
  const methodValidationError = validateDirectReadMethod(methodName);
  if (methodValidationError) return Promise.reject(methodValidationError);
  if (request[requestCache]) {
    if (methodName !== "TRACE") return request[requestCache][method]();
  }
  const alreadyUsedError = consumeBodyDirectOnce(request);
  if (alreadyUsedError) return alreadyUsedError;
  const raw2 = readRawBodyIfAvailable(request);
  if (raw2) {
    const result = Promise.resolve(fromBuffer(raw2, request));
    request[bodyBufferKey] = void 0;
    return result;
  }
  return readBodyDirect(request).then((buf) => {
    const result = fromBuffer(buf, request);
    request[bodyBufferKey] = void 0;
    return result;
  });
};
var readRawBodyIfAvailable = (request) => {
  const incoming = request[incomingKey];
  if ("rawBody" in incoming && incoming.rawBody instanceof Buffer) return incoming.rawBody;
};
var normalizeAbortError = (request, incoming) => {
  if (incoming.errored) return incoming.errored;
  const reason = request[abortReasonKey];
  if (reason !== void 0) return reason instanceof Error ? reason : new Error(String(reason));
  return /* @__PURE__ */ new Error("Client connection prematurely closed.");
};
var readBodyDirect = (request) => {
  if (request[bodyBufferKey]) return Promise.resolve(request[bodyBufferKey]);
  if (request[bodyReadPromiseKey]) return request[bodyReadPromiseKey];
  const incoming = request[incomingKey];
  if (incoming.readableDidRead) return rejectBodyUnusable();
  const buffered = readBodyBufferedBeforeDisconnect(incoming);
  if (buffered !== void 0) {
    if (buffered instanceof Error) return Promise.reject(buffered);
    request[bodyBufferKey] = buffered;
    return Promise.resolve(buffered);
  }
  const promise = new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const recoverCompleteBodyAfterDisconnect = (error) => {
      const streamError = incoming.errored ?? error;
      if (!isRecoverableDisconnectedIncoming(incoming) || streamError && streamError.code !== "ECONNRESET") return false;
      finish(() => {
        const recovered = readBodyBufferedBeforeDisconnect(incoming, chunks);
        if (recovered instanceof Error) reject(recovered);
        else if (recovered === void 0) reject(error ?? normalizeAbortError(request, incoming));
        else {
          request[bodyBufferKey] = recovered;
          resolve(recovered);
        }
      });
      return true;
    };
    const onData = (chunk) => {
      chunks.push(toBufferChunk(chunk, incoming.readableEncoding));
    };
    const onEnd = () => {
      finish(() => {
        const buffer = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
        request[bodyBufferKey] = buffer;
        resolve(buffer);
      });
    };
    const onError = (error) => {
      if (recoverCompleteBodyAfterDisconnect(error)) return;
      finish(() => {
        reject(error);
      });
    };
    const onClose = () => {
      if (incoming.readableEnded) {
        onEnd();
        return;
      }
      if (recoverCompleteBodyAfterDisconnect()) return;
      finish(() => {
        reject(normalizeAbortError(request, incoming));
      });
    };
    const cleanup = () => {
      incoming.off("data", onData);
      incoming.off("end", onEnd);
      incoming.off("error", onError);
      incoming.off("close", onClose);
      request[bodyReadPromiseKey] = void 0;
    };
    incoming.on("data", onData);
    incoming.on("end", onEnd);
    incoming.on("error", onError);
    incoming.on("close", onClose);
    queueMicrotask(() => {
      if (settled) return;
      if (incoming.readableEnded) onEnd();
      else if (incoming.errored) onError(incoming.errored);
      else if (incoming.destroyed) onClose();
    });
  });
  request[bodyReadPromiseKey] = promise;
  return promise;
};
var requestPrototype = {
  get method() {
    return this[methodKey];
  },
  get url() {
    return this[urlKey];
  },
  get headers() {
    return this[headersKey] ||= newHeadersFromIncoming(this[incomingKey]);
  },
  [abortRequest](reason) {
    if (this[abortReasonKey] === void 0) this[abortReasonKey] = reason;
    const abortController = this[abortControllerKey];
    if (abortController && !abortController.signal.aborted) abortController.abort(reason);
  },
  [getAbortController]() {
    this[abortControllerKey] ||= new AbortController();
    if (this[abortReasonKey] !== void 0 && !this[abortControllerKey].signal.aborted) this[abortControllerKey].abort(this[abortReasonKey]);
    return this[abortControllerKey];
  },
  [getRequestCache]() {
    const abortController = this[getAbortController]();
    if (this[requestCache]) return this[requestCache];
    const method = this.method;
    if (this[bodyConsumedDirectlyKey] && !(method === "GET" || method === "HEAD")) {
      this[bodyBufferKey] = void 0;
      const init = {
        method: method === "TRACE" ? "GET" : method,
        headers: this.headers,
        signal: abortController.signal
      };
      if (method !== "TRACE") {
        init.body = new ReadableStream({ start(c) {
          c.close();
        } });
        init.duplex = "half";
      }
      const req = new Request$1(this[urlKey], init);
      if (method === "TRACE") Object.defineProperty(req, "method", { get() {
        return "TRACE";
      } });
      return this[requestCache] = req;
    }
    return this[requestCache] = newRequestFromIncoming(this.method, this[urlKey], this.headers, this[incomingKey], abortController);
  },
  get body() {
    if (!this[bodyConsumedDirectlyKey]) return this[getRequestCache]().body;
    const request = this[getRequestCache]();
    if (!this[bodyLockReaderKey] && request.body) this[bodyLockReaderKey] = request.body.getReader();
    return request.body;
  },
  get bodyUsed() {
    if (this[bodyConsumedDirectlyKey]) return true;
    if (this[requestCache]) return this[requestCache].bodyUsed;
    return false;
  }
};
Object.defineProperty(requestPrototype, "signal", { get() {
  return this[getAbortController]().signal;
} });
[
  "cache",
  "credentials",
  "destination",
  "integrity",
  "mode",
  "redirect",
  "referrer",
  "referrerPolicy",
  "keepalive"
].forEach((k) => {
  Object.defineProperty(requestPrototype, k, { get() {
    return this[getRequestCache]()[k];
  } });
});
["clone", "formData"].forEach((k) => {
  Object.defineProperty(requestPrototype, k, { value: function() {
    if (this[bodyConsumedDirectlyKey]) {
      if (k === "clone") throw newBodyUnusableError();
      return rejectBodyUnusable();
    }
    return this[getRequestCache]()[k]();
  } });
});
Object.defineProperty(requestPrototype, "text", { value: function() {
  return readBodyWithFastPath(this, "text", (buf) => textDecoder.decode(buf));
} });
Object.defineProperty(requestPrototype, "arrayBuffer", { value: function() {
  return readBodyWithFastPath(this, "arrayBuffer", (buf) => toArrayBuffer(buf));
} });
Object.defineProperty(requestPrototype, "blob", { value: function() {
  return readBodyWithFastPath(this, "blob", (buf, request) => {
    const type = contentType(request);
    const init = type ? { headers: { "content-type": type } } : void 0;
    return new Response(buf, init).blob();
  });
} });
Object.defineProperty(requestPrototype, "json", { value: function() {
  if (this[bodyConsumedDirectlyKey]) return rejectBodyUnusable();
  return this.text().then(JSON.parse);
} });
Object.defineProperty(requestPrototype, /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
  return `Request (lightweight) ${inspectFn({
    method: this.method,
    url: this.url,
    headers: this.headers,
    nativeRequest: this[requestCache]
  }, {
    ...options,
    depth: depth == null ? null : depth - 1
  })}`;
} });
Object.setPrototypeOf(requestPrototype, Request$1.prototype);
var newRequest = (incoming, defaultHostname) => {
  const req = Object.create(requestPrototype);
  req[incomingKey] = incoming;
  req[methodKey] = normalizeIncomingMethod(incoming.method);
  const incomingUrl = incoming.url || "";
  if (incomingUrl[0] !== "/" && (incomingUrl.startsWith("http://") || incomingUrl.startsWith("https://"))) {
    if (incoming instanceof Http2ServerRequest) throw new RequestError("Absolute URL for :path is not allowed in HTTP/2");
    try {
      req[urlKey] = new URL(incomingUrl).href;
    } catch (e) {
      throw new RequestError("Invalid absolute URL", { cause: e });
    }
    return req;
  }
  const host = (incoming instanceof Http2ServerRequest ? incoming.authority : incoming.headers.host) || defaultHostname;
  if (!host) throw new RequestError("Missing host header");
  let scheme;
  if (incoming instanceof Http2ServerRequest) {
    scheme = incoming.scheme;
    if (!(scheme === "http" || scheme === "https")) throw new RequestError("Unsupported scheme");
  } else scheme = incoming.socket && incoming.socket.encrypted ? "https" : "http";
  try {
    req[urlKey] = buildUrl(scheme, host, incomingUrl);
  } catch (e) {
    if (e instanceof RequestError) throw e;
    else throw new RequestError("Invalid URL", { cause: e });
  }
  return req;
};
var defaultContentType = "text/plain; charset=UTF-8";
var responseCache = /* @__PURE__ */ Symbol("responseCache");
var getResponseCache = /* @__PURE__ */ Symbol("getResponseCache");
var cacheKey = /* @__PURE__ */ Symbol("cache");
var GlobalResponse = global.Response;
var Response$1 = class Response$12 {
  #body;
  #init;
  [getResponseCache]() {
    const cache = this[cacheKey];
    const liveHeaders = cache && cache[2] instanceof Headers ? cache[2] : void 0;
    delete this[cacheKey];
    return this[responseCache] ||= new GlobalResponse(this.#body, liveHeaders ? {
      status: this.#init?.status,
      statusText: this.#init?.statusText,
      headers: liveHeaders
    } : this.#init);
  }
  constructor(body, init) {
    let headers;
    this.#body = body;
    if (init instanceof GlobalResponse) {
      const cachedGlobalResponse = init[responseCache];
      if (cachedGlobalResponse) {
        this.#init = cachedGlobalResponse;
        this[getResponseCache]();
        return;
      }
      this.#init = init instanceof Response$12 ? init.#init : init;
      headers = new Headers(init.headers);
    } else this.#init = init;
    if (body == null || typeof body === "string" || typeof body?.getReader !== "undefined" || body instanceof Blob || body instanceof Uint8Array) this[cacheKey] = [
      init?.status || 200,
      body ?? null,
      headers || init?.headers
    ];
  }
  get headers() {
    const cache = this[cacheKey];
    if (cache) {
      if (!(cache[2] instanceof Headers)) cache[2] = new Headers(cache[2] || (cache[1] === null ? void 0 : { "content-type": defaultContentType }));
      return cache[2];
    }
    return this[getResponseCache]().headers;
  }
  get status() {
    return this[cacheKey]?.[0] ?? this[getResponseCache]().status;
  }
  get ok() {
    const status = this.status;
    return status >= 200 && status < 300;
  }
};
[
  "body",
  "bodyUsed",
  "redirected",
  "statusText",
  "trailers",
  "type",
  "url"
].forEach((k) => {
  Object.defineProperty(Response$1.prototype, k, { get() {
    return this[getResponseCache]()[k];
  } });
});
[
  "arrayBuffer",
  "blob",
  "clone",
  "formData",
  "json",
  "text"
].forEach((k) => {
  Object.defineProperty(Response$1.prototype, k, { value: function() {
    return this[getResponseCache]()[k]();
  } });
});
Object.defineProperty(Response$1.prototype, /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
  return `Response (lightweight) ${inspectFn({
    status: this.status,
    headers: this.headers,
    ok: this.ok,
    nativeResponse: this[responseCache]
  }, {
    ...options,
    depth: depth == null ? null : depth - 1
  })}`;
} });
Object.setPrototypeOf(Response$1, GlobalResponse);
Object.setPrototypeOf(Response$1.prototype, GlobalResponse.prototype);
var validRedirectUrl = /^https?:\/\/[!#-;=?-[\]_a-z~A-Z]+$/;
var parseRedirectUrl = (url) => {
  if (url instanceof URL) return url.href;
  if (validRedirectUrl.test(url)) return url;
  return new URL(url).href;
};
var validRedirectStatuses = /* @__PURE__ */ new Set([
  301,
  302,
  303,
  307,
  308
]);
Object.defineProperty(Response$1, "redirect", {
  value: function redirect(url, status = 302) {
    if (!validRedirectStatuses.has(status)) throw new RangeError("Invalid status code");
    return new Response$1(null, {
      status,
      headers: { location: parseRedirectUrl(url) }
    });
  },
  writable: true,
  configurable: true
});
Object.defineProperty(Response$1, "json", {
  value: function json(data, init) {
    const body = JSON.stringify(data);
    if (body === void 0) throw new TypeError("The data is not JSON serializable");
    const initHeaders = init?.headers;
    let headers;
    if (initHeaders) {
      headers = new Headers(initHeaders);
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    } else headers = { "content-type": "application/json" };
    return new Response$1(body, {
      status: init?.status ?? 200,
      statusText: init?.statusText,
      headers
    });
  },
  writable: true,
  configurable: true
});
async function readWithoutBlocking(readPromise) {
  return Promise.race([readPromise, Promise.resolve().then(() => Promise.resolve(void 0))]);
}
function writeFromReadableStreamDefaultReader(reader, writable, currentReadPromise) {
  const cancel = (error) => {
    reader.cancel(error).catch(() => {
    });
  };
  writable.on("close", cancel);
  writable.on("error", cancel);
  (currentReadPromise ?? reader.read()).then(flow, handleStreamError);
  return reader.closed.finally(() => {
    writable.off("close", cancel);
    writable.off("error", cancel);
  });
  function handleStreamError(error) {
    if (error) writable.destroy(error);
  }
  function onDrain() {
    reader.read().then(flow, handleStreamError);
  }
  function flow({ done, value }) {
    try {
      if (done) writable.end();
      else if (!writable.write(value)) writable.once("drain", onDrain);
      else return reader.read().then(flow, handleStreamError);
    } catch (e) {
      handleStreamError(e);
    }
  }
}
function writeFromReadableStream(stream, writable) {
  if (stream.locked) throw new TypeError("ReadableStream is locked.");
  else if (writable.destroyed) return;
  return writeFromReadableStreamDefaultReader(stream.getReader(), writable);
}
var buildOutgoingHttpHeaders = (headers, defaultContentType2) => {
  const res = {};
  if (!(headers instanceof Headers)) headers = new Headers(headers ?? void 0);
  if (headers.has("set-cookie")) {
    const cookies = [];
    for (const [k, v] of headers) if (k === "set-cookie") cookies.push(v);
    else res[k] = v;
    if (cookies.length > 0) res["set-cookie"] = cookies;
  } else for (const [k, v] of headers) res[k] = v;
  if (defaultContentType2) res["content-type"] ??= defaultContentType2;
  return res;
};
var outgoingEnded = /* @__PURE__ */ Symbol("outgoingEnded");
var incomingDraining = /* @__PURE__ */ Symbol("incomingDraining");
var DRAIN_TIMEOUT_MS = 500;
var MAX_DRAIN_BYTES = 64 * 1024 * 1024;
var drainIncoming = (incoming) => {
  const incomingWithDrainState = incoming;
  if (incoming.destroyed || incomingWithDrainState[incomingDraining]) return;
  incomingWithDrainState[incomingDraining] = true;
  if (incoming instanceof Http2ServerRequest) {
    try {
      incoming.stream?.close?.(constants.NGHTTP2_NO_ERROR);
    } catch {
    }
    return;
  }
  let bytesRead = 0;
  const cleanup = () => {
    clearTimeout(timer);
    incoming.off("data", onData);
    incoming.off("end", cleanup);
    incoming.off("error", cleanup);
  };
  const forceClose = () => {
    cleanup();
    const socket = incoming.socket;
    if (socket && !socket.destroyed) {
      if (typeof socket.destroySoon === "function") socket.destroySoon();
      else if (typeof socket.destroy === "function") socket.destroy();
    }
  };
  const timer = setTimeout(forceClose, DRAIN_TIMEOUT_MS);
  timer.unref?.();
  const onData = (chunk) => {
    bytesRead += chunk.length;
    if (bytesRead > MAX_DRAIN_BYTES) forceClose();
  };
  incoming.on("data", onData);
  incoming.on("end", cleanup);
  incoming.on("error", cleanup);
  incoming.resume();
};
var makeCloseHandler = (req, incoming, outgoing, needsBodyCleanup) => () => {
  if (incoming.errored) {
    recordBodyBufferedBeforeDisconnect(incoming);
    req[abortRequest](incoming.errored.toString());
  } else if (!outgoing.writableFinished || incoming instanceof Http2ServerRequest && incoming.aborted) {
    recordBodyBufferedBeforeDisconnect(incoming);
    req[abortRequest]("Client connection prematurely closed.");
  }
  if (needsBodyCleanup && !incoming.readableEnded) setTimeout(() => {
    if (!incoming.readableEnded) setTimeout(() => {
      drainIncoming(incoming);
    });
  });
};
var isImmediateCacheableResponse = (res) => {
  if (!(cacheKey in res)) return false;
  const body = res[cacheKey][1];
  return body === null || typeof body === "string" || body instanceof Uint8Array;
};
var handleRequestError = () => new Response(null, { status: 400 });
var handleFetchError = (e) => new Response(null, { status: e instanceof Error && (e.name === "TimeoutError" || e.constructor.name === "TimeoutError") ? 504 : 500 });
var handleResponseError = (e, outgoing) => {
  const err = e instanceof Error ? e : new Error("unknown error", { cause: e });
  if (err.code === "ERR_STREAM_PREMATURE_CLOSE") console.info("The user aborted a request.");
  else {
    console.error(e);
    if (!outgoing.headersSent) {
      if (outgoing instanceof ServerResponse) outgoing._contentLength = null;
      outgoing.writeHead(500, { "Content-Type": "text/plain" });
    }
    outgoing.end(`Error: ${err.message}`);
    outgoing.destroy(err);
  }
};
var flushHeaders = (outgoing) => {
  if ("flushHeaders" in outgoing && outgoing.writable) outgoing.flushHeaders();
};
var trySetContentLength = (outgoing, status, length) => {
  const http1 = outgoing;
  if (http1._contentLength === null && http1._hasBody && http1.useChunkedEncodingByDefault && !http1._removedContLen && status >= 200 && status !== 204 && status !== 304 && !outgoing.hasHeader("content-length") && !outgoing.hasHeader("transfer-encoding") && !outgoing.hasHeader("trailer")) {
    http1._contentLength = length;
    return true;
  }
  return false;
};
var writeDefaultHeaders = (outgoing, status, length) => {
  if (trySetContentLength(outgoing, status, length)) outgoing.writeHead(status, { "Content-Type": defaultContentType });
  else outgoing.writeHead(status, {
    "Content-Type": defaultContentType,
    "Content-Length": length
  });
};
var responseViaCache = async (res, outgoing) => {
  let [status, body, header] = res[cacheKey];
  if (!header) {
    if (body === null) {
      outgoing.writeHead(status);
      outgoing.end();
    } else if (typeof body === "string") {
      writeDefaultHeaders(outgoing, status, Buffer.byteLength(body));
      outgoing.end(body);
    } else if (body instanceof Uint8Array) {
      writeDefaultHeaders(outgoing, status, body.byteLength);
      outgoing.end(body);
    } else if (body instanceof Blob) {
      writeDefaultHeaders(outgoing, status, body.size);
      outgoing.end(new Uint8Array(await body.arrayBuffer()));
    } else {
      outgoing.writeHead(status, { "Content-Type": defaultContentType });
      flushHeaders(outgoing);
      await writeFromReadableStream(body, outgoing)?.catch((e) => handleResponseError(e, outgoing));
    }
    outgoing[outgoingEnded]?.();
    return;
  }
  let hasContentLength = false;
  let plainHeaders = false;
  let canAutoLength = true;
  if (header instanceof Headers) {
    hasContentLength = header.has("content-length");
    header = buildOutgoingHttpHeaders(header, body === null ? void 0 : defaultContentType);
  } else if (Array.isArray(header)) {
    const headerObj = new Headers(header);
    hasContentLength = headerObj.has("content-length");
    header = buildOutgoingHttpHeaders(headerObj, body === null ? void 0 : defaultContentType);
  } else {
    plainHeaders = true;
    for (const key in header) {
      if (key.length === 14 && key.toLowerCase() === "content-length") {
        hasContentLength = true;
        break;
      }
      if (key.length === 17 && key.toLowerCase() === "transfer-encoding" || key.length === 7 && key.toLowerCase() === "trailer") canAutoLength = false;
    }
  }
  if (!hasContentLength) {
    let length;
    if (typeof body === "string") length = Buffer.byteLength(body);
    else if (body instanceof Uint8Array) length = body.byteLength;
    else if (body instanceof Blob) length = body.size;
    if (length !== void 0 && (!plainHeaders || !canAutoLength || !trySetContentLength(outgoing, status, length))) {
      if (plainHeaders) header = { ...header };
      header["Content-Length"] = length;
    }
  }
  outgoing.writeHead(status, header);
  if (body == null) outgoing.end();
  else if (typeof body === "string" || body instanceof Uint8Array) outgoing.end(body);
  else if (body instanceof Blob) outgoing.end(new Uint8Array(await body.arrayBuffer()));
  else {
    flushHeaders(outgoing);
    await writeFromReadableStream(body, outgoing)?.catch((e) => handleResponseError(e, outgoing));
  }
  outgoing[outgoingEnded]?.();
};
var isPromise = (res) => typeof res.then === "function";
var responseViaResponseObject = async (res, outgoing, options = {}) => {
  if (isPromise(res)) if (options.errorHandler) try {
    res = await res;
  } catch (err) {
    const errRes = await options.errorHandler(err);
    if (!errRes) return;
    res = errRes;
  }
  else res = await res.catch(handleFetchError);
  if (cacheKey in res) return responseViaCache(res, outgoing);
  const resHeaderRecord = buildOutgoingHttpHeaders(res.headers, res.body === null ? void 0 : defaultContentType);
  if (res.body) {
    const reader = res.body.getReader();
    const values = [];
    let done = false;
    let currentReadPromise = void 0;
    if (resHeaderRecord["transfer-encoding"] !== "chunked") {
      let maxReadCount = 2;
      for (let i = 0; i < maxReadCount; i++) {
        currentReadPromise ||= reader.read();
        const chunk = await readWithoutBlocking(currentReadPromise).catch((e) => {
          console.error(e);
          done = true;
        });
        if (!chunk) {
          if (i === 1) {
            await new Promise((resolve) => setTimeout(resolve));
            maxReadCount = 3;
            continue;
          }
          break;
        }
        currentReadPromise = void 0;
        if (chunk.value) values.push(chunk.value);
        if (chunk.done) {
          done = true;
          break;
        }
      }
      if (done && !("content-length" in resHeaderRecord)) resHeaderRecord["content-length"] = values.reduce((acc, value) => acc + value.length, 0);
    }
    outgoing.writeHead(res.status, resHeaderRecord);
    values.forEach((value) => {
      outgoing.write(value);
    });
    if (done) outgoing.end();
    else {
      if (values.length === 0) flushHeaders(outgoing);
      await writeFromReadableStreamDefaultReader(reader, outgoing, currentReadPromise);
    }
  } else if (resHeaderRecord[X_ALREADY_SENT]) {
  } else {
    outgoing.writeHead(res.status, resHeaderRecord);
    outgoing.end();
  }
  outgoing[outgoingEnded]?.();
};
var getRequestListener = (fetchCallback, options = {}) => {
  const autoCleanupIncoming = options.autoCleanupIncoming ?? true;
  if (options.overrideGlobalObjects !== false && global.Request !== Request$1) {
    Object.defineProperty(global, "Request", { value: Request$1 });
    Object.defineProperty(global, "Response", { value: Response$1 });
  }
  return async (incoming, outgoing) => {
    let res, req;
    let needsBodyCleanup = false;
    let closeHandlerAttached = false;
    const ensureCloseHandler = () => {
      if (!req || closeHandlerAttached) return;
      closeHandlerAttached = true;
      outgoing.on("close", makeCloseHandler(req, incoming, outgoing, needsBodyCleanup));
    };
    try {
      req = newRequest(incoming, options.hostname);
      needsBodyCleanup = autoCleanupIncoming && !(incoming.method === "GET" || incoming.method === "HEAD");
      if (needsBodyCleanup) {
        incoming[wrapBodyStream] = true;
        if (incoming instanceof Http2ServerRequest) outgoing[outgoingEnded] = () => {
          if (!incoming.readableEnded) setTimeout(() => {
            if (!incoming.readableEnded) setTimeout(() => {
              incoming.destroy();
              outgoing.destroy();
            });
          });
        };
      }
      res = fetchCallback(req, {
        incoming,
        outgoing
      });
      if (!isPromise(res) && isImmediateCacheableResponse(res)) {
        if (needsBodyCleanup && !incoming.readableEnded) outgoing.once("finish", () => {
          if (!incoming.readableEnded) drainIncoming(incoming);
        });
        return responseViaCache(res, outgoing);
      }
      ensureCloseHandler();
    } catch (e) {
      if (!res) if (options.errorHandler) {
        ensureCloseHandler();
        res = await options.errorHandler(req ? e : toRequestError(e));
        if (!res) return;
      } else if (!req) res = handleRequestError();
      else res = handleFetchError(e);
      else return handleResponseError(e, outgoing);
    }
    try {
      return await responseViaResponseObject(res, outgoing, options);
    } catch (e) {
      return handleResponseError(e, outgoing);
    }
  };
};
var CloseEvent = globalThis.CloseEvent ?? class extends Event {
  #eventInitDict;
  constructor(type, eventInitDict = {}) {
    super(type, eventInitDict);
    this.#eventInitDict = eventInitDict;
  }
  get wasClean() {
    return this.#eventInitDict.wasClean ?? false;
  }
  get code() {
    return this.#eventInitDict.code ?? 0;
  }
  get reason() {
    return this.#eventInitDict.reason ?? "";
  }
};
var ErrorEvent = globalThis.ErrorEvent ?? class extends Event {
  #eventInitDict;
  constructor(type, eventInitDict = {}) {
    super(type, eventInitDict);
    this.#eventInitDict = eventInitDict;
  }
  get message() {
    return this.#eventInitDict.message ?? "";
  }
  get filename() {
    return this.#eventInitDict.filename ?? "";
  }
  get lineno() {
    return this.#eventInitDict.lineno ?? 0;
  }
  get colno() {
    return this.#eventInitDict.colno ?? 0;
  }
  get error() {
    return this.#eventInitDict.error ?? null;
  }
};
var generateConnectionSymbol = () => /* @__PURE__ */ Symbol("connection");
var CONNECTION_SYMBOL_KEY = /* @__PURE__ */ Symbol("CONNECTION_SYMBOL_KEY");
var WAIT_FOR_WEBSOCKET_SYMBOL = /* @__PURE__ */ Symbol("WAIT_FOR_WEBSOCKET_SYMBOL");
var upgradeWebSocket = defineWebSocketHelper(async (c, events, options) => {
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return;
  const env = c.env;
  const waitForWebSocket = env[WAIT_FOR_WEBSOCKET_SYMBOL];
  if (!waitForWebSocket || !env.incoming) return new Response(null, { status: 500 });
  const connectionSymbol = generateConnectionSymbol();
  env[CONNECTION_SYMBOL_KEY] = connectionSymbol;
  (async () => {
    let ws;
    try {
      ws = await waitForWebSocket(env.incoming, connectionSymbol);
    } catch {
      return;
    }
    const messagesReceivedInStarting = [];
    const bufferMessage = (data, isBinary) => {
      messagesReceivedInStarting.push([data, isBinary]);
    };
    ws.on("message", bufferMessage);
    const ctx = {
      binaryType: "arraybuffer",
      close(code, reason) {
        ws.close(code, reason);
      },
      protocol: ws.protocol,
      raw: ws,
      get readyState() {
        return ws.readyState;
      },
      send(source, opts) {
        ws.send(source, { compress: opts?.compress });
      },
      url: new URL(c.req.url)
    };
    try {
      events?.onOpen?.(new Event("open"), ctx);
    } catch (e) {
      (options?.onError ?? console.error)(e);
    }
    const handleMessage = (data, isBinary) => {
      const datas = Array.isArray(data) ? data : [data];
      for (const data2 of datas) try {
        events?.onMessage?.(new MessageEvent("message", { data: isBinary ? data2 instanceof ArrayBuffer ? data2 : data2.buffer.slice(data2.byteOffset, data2.byteOffset + data2.byteLength) : typeof data2 === "string" ? data2 : Buffer.from(data2).toString("utf-8") }), ctx);
      } catch (e) {
        (options?.onError ?? console.error)(e);
      }
    };
    ws.off("message", bufferMessage);
    for (const message of messagesReceivedInStarting) handleMessage(...message);
    ws.on("message", (data, isBinary) => {
      handleMessage(data, isBinary);
    });
    ws.on("close", (code, reason) => {
      try {
        events?.onClose?.(new CloseEvent("close", {
          code,
          reason: reason.toString()
        }), ctx);
      } catch (e) {
        (options?.onError ?? console.error)(e);
      }
    });
    ws.on("error", (error) => {
      try {
        events?.onError?.(new ErrorEvent("error", { error }), ctx);
      } catch (e) {
        (options?.onError ?? console.error)(e);
      }
    });
  })();
  return new Response();
});

// node_modules/@hono/node-server/dist/utils/stream.mjs
import { Readable as Readable2 } from "node:stream";
import { versions } from "node:process";
var pr54206Applied = () => {
  const [major, minor] = versions.node.split(".").map((component) => parseInt(component));
  return major >= 23 || major === 22 && minor >= 7 || major === 20 && minor >= 18;
};
var useReadableToWeb = pr54206Applied();
var createStreamBody = (stream, useNativeReadableToWeb = useReadableToWeb) => {
  if (useNativeReadableToWeb) return Readable2.toWeb(stream);
  let controller;
  let settled = false;
  const cleanup = () => {
    stream.off("data", onData);
    stream.off("error", onError);
    stream.off("end", onTerminate);
    stream.off("close", onTerminate);
  };
  const settle = (callback) => {
    if (settled) return;
    settled = true;
    cleanup();
    callback?.();
  };
  const onData = (chunk) => {
    if (settled || !controller) return;
    controller.enqueue(chunk);
    if ((controller.desiredSize ?? 0) <= 0) stream.pause();
  };
  const onError = (error) => {
    settle(() => {
      controller?.error(error);
    });
  };
  const onTerminate = () => {
    settle(() => {
      controller?.close();
    });
  };
  return new ReadableStream({
    start(streamController) {
      controller = streamController;
      stream.on("data", onData);
      stream.on("error", onError);
      stream.on("end", onTerminate);
      stream.on("close", onTerminate);
      stream.pause();
    },
    pull() {
      if (!settled) stream.resume();
    },
    cancel() {
      settle();
      const ignoreError = () => {
      };
      stream.on("error", ignoreError);
      stream.once("close", () => stream.off("error", ignoreError));
      stream.destroy();
    }
  });
};

// node_modules/hono/dist/utils/mime.js
var getMimeType = (filename, mimes = baseMimes) => {
  const match2 = filename.match(/\.([a-zA-Z0-9]+?)$/);
  if (!match2) return;
  return mimes[match2[1].toLowerCase()];
};
var baseMimes = {
  aac: "audio/aac",
  avi: "video/x-msvideo",
  avif: "image/avif",
  av1: "video/av1",
  bin: "application/octet-stream",
  bmp: "image/bmp",
  css: "text/css; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  eot: "application/vnd.ms-fontobject",
  epub: "application/epub+zip",
  gif: "image/gif",
  gz: "application/gzip",
  htm: "text/html; charset=utf-8",
  html: "text/html; charset=utf-8",
  ico: "image/x-icon",
  ics: "text/calendar; charset=utf-8",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript; charset=utf-8",
  json: "application/json",
  jsonld: "application/ld+json",
  map: "application/json",
  mid: "audio/x-midi",
  midi: "audio/x-midi",
  mjs: "text/javascript; charset=utf-8",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  mpeg: "video/mpeg",
  oga: "audio/ogg",
  ogv: "video/ogg",
  ogx: "application/ogg",
  opus: "audio/opus",
  otf: "font/otf",
  pdf: "application/pdf",
  png: "image/png",
  rtf: "application/rtf",
  svg: "image/svg+xml; charset=utf-8",
  tif: "image/tiff",
  tiff: "image/tiff",
  ts: "video/mp2t",
  ttf: "font/ttf",
  txt: "text/plain; charset=utf-8",
  wasm: "application/wasm",
  webm: "video/webm",
  weba: "audio/webm",
  webmanifest: "application/manifest+json",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  xhtml: "application/xhtml+xml; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  zip: "application/zip",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",
  gltf: "model/gltf+json",
  glb: "model/gltf-binary"
};

// node_modules/@hono/node-server/dist/serve-static.mjs
import { createReadStream, existsSync, statSync } from "node:fs";
import { join } from "node:path";
var COMPRESSIBLE_CONTENT_TYPE_REGEX = /^\s*(?:text\/[^;\s]+|application\/(?:javascript|json|xml|xml-dtd|ecmascript|dart|postscript|rtf|tar|toml|vnd\.dart|vnd\.ms-fontobject|vnd\.ms-opentype|wasm|x-httpd-php|x-javascript|x-ns-proxy-autoconfig|x-sh|x-tar|x-virtualbox-hdd|x-virtualbox-ova|x-virtualbox-ovf|x-virtualbox-vbox|x-virtualbox-vdi|x-virtualbox-vhd|x-virtualbox-vmdk|x-www-form-urlencoded)|font\/(?:otf|ttf)|image\/(?:bmp|vnd\.adobe\.photoshop|vnd\.microsoft\.icon|vnd\.ms-dds|x-icon|x-ms-bmp)|message\/rfc822|model\/gltf-binary|x-shader\/x-fragment|x-shader\/x-vertex|[^;\s]+?\+(?:json|text|xml|yaml))(?:[;\s]|$)/i;
var ENCODINGS = {
  br: ".br",
  zstd: ".zst",
  gzip: ".gz"
};
var ENCODINGS_ORDERED_KEYS = Object.keys(ENCODINGS);
var getStats = (path2) => {
  let stats;
  try {
    stats = statSync(path2);
  } catch {
  }
  return stats;
};
var BYTE_RANGE_PATTERN = /^(?:bytes=)?(?!-$)(\d*)-(\d*)$/;
var parseByteRange = (range) => {
  const match2 = range.match(BYTE_RANGE_PATTERN);
  if (!match2) return;
  const [, start, end] = match2;
  if (start === "") return {
    type: "suffix",
    length: Number(end)
  };
  if (end === "") return {
    type: "open-ended",
    start: Number(start)
  };
  return {
    type: "bounded",
    start: Number(start),
    end: Number(end)
  };
};
var resolveByteRange = (spec, size2) => {
  if (size2 === 0) return;
  if (spec.type === "suffix") {
    if (spec.length === 0) return;
    return {
      start: Math.max(size2 - spec.length, 0),
      end: size2 - 1
    };
  }
  const end = spec.type === "bounded" ? Math.min(spec.end, size2 - 1) : size2 - 1;
  if (spec.start >= size2 || spec.start > end) return;
  return {
    start: spec.start,
    end
  };
};
var tryDecode = (str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
};
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var serveStatic = (options = { root: "" }) => {
  const root = options.root || "";
  const optionPath = options.path;
  if (root !== "" && !existsSync(root)) console.error(`serveStatic: root path '${root}' is not found, are you sure it's correct?`);
  return async (c, next) => {
    if (c.finalized) return next();
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();
    let filename;
    if (optionPath) filename = optionPath;
    else try {
      if (!options.allowPercentInPath && c.req.path.includes("%")) throw new Error();
      filename = tryDecodeURI(c.req.path);
      if (/(?:^|[\/\\])\.{1,2}(?:$|[\/\\])|[\/\\]{2,}|\\/.test(filename)) throw new Error();
    } catch {
      await options.onNotFound?.(c.req.path, c);
      return next();
    }
    let path2 = join(root, !optionPath && options.rewriteRequestPath ? options.rewriteRequestPath(filename, c) : filename);
    let stats = getStats(path2);
    if (stats && stats.isDirectory()) {
      const indexFile = options.index ?? "index.html";
      path2 = join(path2, indexFile);
      stats = getStats(path2);
    }
    if (!stats) {
      await options.onNotFound?.(path2, c);
      return next();
    }
    const mimeType = getMimeType(path2);
    c.header("Content-Type", mimeType || "application/octet-stream");
    if (options.precompressed && (!mimeType || mimeType === "application/octet-stream" || COMPRESSIBLE_CONTENT_TYPE_REGEX.test(mimeType))) {
      const acceptEncodingSet = new Set(c.req.header("Accept-Encoding")?.split(",").map((encoding) => encoding.trim()));
      for (const encoding of ENCODINGS_ORDERED_KEYS) {
        if (!acceptEncodingSet.has(encoding)) continue;
        const precompressedStats = getStats(path2 + ENCODINGS[encoding]);
        if (precompressedStats) {
          c.header("Content-Encoding", encoding);
          c.header("Vary", "Accept-Encoding", { append: true });
          stats = precompressedStats;
          path2 = path2 + ENCODINGS[encoding];
          break;
        }
      }
    }
    let result;
    const size2 = stats.size;
    const range = c.req.header("range") || "";
    c.header("Last-Modified", stats.mtime.toUTCString());
    if (c.req.method === "HEAD") {
      c.header("Content-Length", size2.toString());
      c.status(200);
      result = c.body(null);
    } else if (!range) {
      c.header("Content-Length", size2.toString());
      result = c.body(createStreamBody(createReadStream(path2)), 200);
    } else {
      c.header("Accept-Ranges", "bytes");
      const resolvedRange = resolveByteRange(parseByteRange(range) ?? {
        type: "open-ended",
        start: 0
      }, size2);
      if (!resolvedRange) {
        c.header("Content-Range", `bytes */${size2}`);
        result = c.body(null, 416);
      } else {
        const { start, end } = resolvedRange;
        const chunkSize = end - start + 1;
        const stream = createReadStream(path2, {
          start,
          end
        });
        c.header("Content-Length", chunkSize.toString());
        c.header("Content-Range", `bytes ${start}-${end}/${size2}`);
        result = c.body(createStreamBody(stream), 206);
      }
    }
    await options.onFound?.(path2, c);
    return result;
  };
};

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = (arrayBuffer, contentType2) => {
  return new Response(arrayBuffer, { headers: { "Content-Type": contentType2.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase()) } }).formData();
};

// node_modules/hono/dist/utils/body.js
var MAX_NESTED_OBJECTS = 1e4;
var isRawRequest = (request) => "headers" in request;
var parseBody = async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const mediaType = (isRawRequest(request) ? request.headers : request.raw.headers).get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") return parseFormData(request, {
    all,
    dot
  });
  return {};
};
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) return convertFormDataToBodyData(await request.bodyCache.formData, options);
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) request.bodyCache.formData = formDataPromise;
  const formData = await formDataPromise;
  if (formData) return convertFormDataToBodyData(formData, options);
  return {};
}
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  const nestingState = { count: 0 };
  formData.forEach((value, key) => {
    if (!(options.all || key.endsWith("[]"))) form[key] = value;
    else handleParsingAllValues(form, key, value);
  });
  if (options.dot) Object.entries(form).forEach(([key, value]) => {
    if (key.includes(".")) {
      handleParsingNestedValues(form, key, value, nestingState);
      delete form[key];
    }
  });
  return form;
}
var handleParsingAllValues = (form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) form[key].push(value);
    else form[key] = [form[key], value];
  } else if (!key.endsWith("[]")) form[key] = value;
  else form[key] = [value];
};
var handleParsingNestedValues = (form, key, value, state) => {
  if (/(?:^|\.)__proto__\./.test(key)) return;
  let nestedForm = form;
  const keys = key.split(".", 34);
  if (keys.length > 33) throwNestingLimitExceeded();
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) nestedForm[key2] = value;
    else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        if (state.count++ >= MAX_NESTED_OBJECTS) throwNestingLimitExceeded();
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
};
var throwNestingLimitExceeded = () => {
  throw new Error("Nesting limit exceeded");
};

// node_modules/hono/dist/utils/url.js
var splitPath = (path2) => {
  const paths = path2.split("/");
  if (paths[0] === "") paths.shift();
  return paths;
};
var splitRoutingPath = (routePath) => {
  const { groups, path: path2 } = extractGroupsFromPath(routePath);
  const paths = splitPath(path2);
  return replaceGroupMarks(paths, groups);
};
var extractGroupsFromPath = (path2) => {
  const groups = [];
  path2 = path2.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return {
    groups,
    path: path2
  };
};
var replaceGroupMarks = (paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) if (paths[j].includes(mark)) {
      paths[j] = paths[j].replace(mark, groups[i][1]);
      break;
    }
  }
  return paths;
};
var patternCache = {};
var getPattern = (label, next) => {
  if (label === "*") return "*";
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey2 = `${label}#${next}`;
    if (!patternCache[cacheKey2]) {
      if (match2[2]) patternCache[cacheKey2] = next && next[0] !== ":" && next[0] !== "*" ? [
        cacheKey2,
        match2[1],
        new RegExp(`^${match2[2]}(?=/${next})`)
      ] : [
        label,
        match2[1],
        new RegExp(`^${match2[2]}$`)
      ];
      else patternCache[cacheKey2] = [
        label,
        match2[1],
        true
      ];
    }
    return patternCache[cacheKey2];
  }
  return null;
};
var tryDecode2 = (str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
};
var tryDecodeURI2 = (str) => tryDecode2(str, decodeURI);
var getPath = (request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path2 = url.slice(start, end);
      return tryDecodeURI2(path2.includes("%25") ? path2.replace(/%25/g, "%2525") : path2);
    } else if (charCode === 63 || charCode === 35) break;
  }
  return url.slice(start, i);
};
var getPathNoStrict = (request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
var mergePath = (base, sub, ...rest) => {
  if (rest.length) sub = mergePath(sub, ...rest);
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path2) => {
  if (path2.charCodeAt(path2.length - 1) !== 63 || !path2.includes(":")) return null;
  const segments = path2.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) basePath += "/" + segment;
    else if (/\:/.test(segment)) {
      if (segment.charCodeAt(segment.length - 1) === 63) {
        if (results.length === 0 && basePath === "") results.push("/");
        else results.push(basePath);
        const optionalSegment = segment.slice(0, -1);
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else basePath += "/" + segment;
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
};
var tryDecodeURIComponent = (str) => str.indexOf("%") !== -1 ? tryDecode2(str, decodeURIComponent_) : str;
var _decodeURI = (value) => {
  if (value.indexOf("+") !== -1) value = value.replace(/\+/g, " ");
  return tryDecodeURIComponent(value);
};
var _getQueryParam = (url, key, multiple) => {
  const hashIndex = url.indexOf("#", 8);
  if (hashIndex !== -1) url = url.slice(0, hashIndex);
  let encoded;
  if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
    const queryIndex = url.indexOf("?", 8);
    let keyIndex2 = queryIndex;
    if (keyIndex2 === -1) return;
    if (!url.startsWith(key, keyIndex2 + 1)) keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61 || trailingKeyCode === 38 || isNaN(trailingKeyCode)) {
        if (keyIndex2 > queryIndex && /(?:^|&)[^=&]*[%+]/.test(url.slice(queryIndex + 1, keyIndex2))) break;
        if (trailingKeyCode === 61) {
          const valueIndex = keyIndex2 + key.length + 2;
          const endIndex = url.indexOf("&", valueIndex);
          return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
        }
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) return;
  }
  const results = /* @__PURE__ */ Object.create(null);
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) valueIndex = -1;
    let name = url.slice(keyIndex + 1, valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex);
    if (encoded) name = _decodeURI(name);
    keyIndex = nextKeyIndex;
    if (name === "") continue;
    let value;
    if (valueIndex === -1) value = "";
    else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) value = _decodeURI(value);
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) results[name] = [];
      results[name].push(value);
    } else results[name] ??= value;
  }
  return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
  return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var HonoRequest = class {
  /**
  * `.raw` can get the raw Request object.
  *
  * @see {@link https://hono.dev/docs/api/request#raw}
  *
  * @example
  * ```ts
  * // For Cloudflare Workers
  * app.post('/', async (c) => {
  *   const metadata = c.req.raw.cf?.hostMetadata?
  *   ...
  * })
  * ```
  */
  raw;
  #validatedData;
  #matchResult;
  routeIndex = 0;
  /**
  * `.path` can get the pathname of the request.
  *
  * @see {@link https://hono.dev/docs/api/request#path}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const pathname = c.req.path // `/about/me`
  * })
  * ```
  */
  path;
  bodyCache = {};
  constructor(request, path2 = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path2;
    this.#matchResult = matchResult;
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
    const param = this.#getParamValue(paramKey);
    return param && tryDecodeURIComponent(param);
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) decoded[key] = tryDecodeURIComponent(value);
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) return this.raw.headers.get(name) ?? void 0;
    const headerData = /* @__PURE__ */ Object.create(null);
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = (key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) return cachedBody;
    for (const anyCachedKey in bodyCache) return bodyCache[anyCachedKey].then((body) => {
      if (anyCachedKey === "json") body = JSON.stringify(body);
      const contentType2 = anyCachedKey === "formData" ? void 0 : raw2.headers.get("content-type");
      return new Response(body, { headers: contentType2 ? { "Content-Type": contentType2 } : void 0 })[key]();
    });
    return bodyCache[key] = raw2[key]();
  };
  /**
  * `.json()` can parse Request body of type `application/json`
  *
  * @see {@link https://hono.dev/docs/api/request#json}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.json()
  * })
  * ```
  */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
  * `.text()` can parse Request body of type `text/plain`
  *
  * @see {@link https://hono.dev/docs/api/request#text}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.text()
  * })
  * ```
  */
  text() {
    return this.#cachedBody("text");
  }
  /**
  * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
  *
  * @see {@link https://hono.dev/docs/api/request#arraybuffer}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.arrayBuffer()
  * })
  * ```
  */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
  * `.bytes()` parses the request body as a `Uint8Array`.
  *
  * @see {@link https://hono.dev/docs/api/request#bytes}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.bytes()
  * })
  * ```
  */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
  * Parses the request body as a `Blob`.
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.blob();
  * });
  * ```
  * @see https://hono.dev/docs/api/request#blob
  */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
  * Parses the request body as `FormData`.
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.formData();
  * });
  * ```
  * @see https://hono.dev/docs/api/request#formdata
  */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
  * Adds validated data to the request.
  *
  * @param target - The target of the validation.
  * @param data - The validated data to add.
  */
  addValidatedData(target, data) {
    (this.#validatedData ??= {})[target] = data;
  }
  valid(target) {
    return this.#validatedData?.[target];
  }
  /**
  * `.url` can get the request url strings.
  *
  * @see {@link https://hono.dev/docs/api/request#url}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const url = c.req.url // `http://localhost:8787/about/me`
  *   ...
  * })
  * ```
  */
  get url() {
    return this.raw.url;
  }
  /**
  * `.method` can get the method name of the request.
  *
  * @see {@link https://hono.dev/docs/api/request#method}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const method = c.req.method // `GET`
  * })
  * ```
  */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
  * `.matchedRoutes` can return a matched route in the handler
  *
  * @deprecated
  *
  * Use matchedRoutes helper defined in "hono/route" instead.
  *
  * @see {@link https://hono.dev/docs/api/request#matchedroutes}
  *
  * @example
  * ```ts
  * app.use('*', async function logger(c, next) {
  *   await next()
  *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
  *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
  *     console.log(
  *       method,
  *       ' ',
  *       path,
  *       ' '.repeat(Math.max(10 - path.length, 0)),
  *       name,
  *       i === c.req.routeIndex ? '<- respond from here' : ''
  *     )
  *   })
  * })
  * ```
  */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
  * `.routePath` can retrieve the path registered within the handler
  *
  * @deprecated
  *
  * Use routePath helper defined in "hono/route" instead.
  *
  * @see {@link https://hono.dev/docs/api/request#routepath}
  *
  * @example
  * ```ts
  * app.get('/posts/:id', (c) => {
  *   return c.json({ path: c.req.routePath })
  * })
  * ```
  */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = (value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) str = str.toString();
    if (str instanceof Promise) str = await str;
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) return Promise.resolve(str);
  if (buffer) buffer[0] += str;
  else buffer = [str];
  const resStr = Promise.all(callbacks.map((c) => c({
    phase,
    buffer,
    context
  }))).then((res) => Promise.all(res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))).then(() => buffer[0]));
  if (preserveCallbacks) return raw(await resStr, callbacks);
  else return resStr;
};

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType2, headers) => {
  return {
    "Content-Type": contentType2,
    ...headers
  };
};
var createResponseInstance = (body, init) => new Response(body, init);
var Context = class {
  #rawRequest;
  #req;
  /**
  * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
  *
  * @see {@link https://hono.dev/docs/api/context#env}
  *
  * @example
  * ```ts
  * // Environment object for Cloudflare Workers
  * app.get('*', async c => {
  *   const counter = c.env.COUNTER
  * })
  * ```
  */
  env = {};
  #var;
  finalized = false;
  /**
  * `.error` can get the error object from the middleware if the Handler throws an error.
  *
  * @see {@link https://hono.dev/docs/api/context#error}
  *
  * @example
  * ```ts
  * app.use('*', async (c, next) => {
  *   await next()
  *   if (c.error) {
  *     // do something...
  *   }
  * })
  * ```
  */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
  * Creates an instance of the Context class.
  *
  * @param req - The Request object.
  * @param options - Optional configuration options for the context.
  */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
  * `.req` is the instance of {@link HonoRequest}.
  */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#event}
  * The FetchEvent associated with the current request.
  *
  * @throws Will throw an error if the context does not have a FetchEvent.
  */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) return this.#executionCtx;
    else throw Error("This context has no FetchEvent");
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#executionctx}
  * The ExecutionContext associated with the current request.
  *
  * @throws Will throw an error if the context does not have an ExecutionContext.
  */
  get executionCtx() {
    if (this.#executionCtx) return this.#executionCtx;
    else throw Error("This context has no ExecutionContext");
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#res}
  * The Response object for the current request.
  */
  get res() {
    return this.#res ||= createResponseInstance(null, { headers: this.#preparedHeaders ??= new Headers() });
  }
  /**
  * Sets the Response object for the current request.
  *
  * @param _res - The Response object to set.
  */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") continue;
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) _res.headers.append("set-cookie", cookie);
        } else _res.headers.set(k, v);
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
  * `.render()` can create a response within a layout.
  *
  * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
  *
  * @example
  * ```ts
  * app.get('/', (c) => {
  *   return c.render('Hello!')
  * })
  * ```
  */
  render = (...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  };
  /**
  * Sets the layout for the response.
  *
  * @param layout - The layout to set.
  * @returns The layout function.
  */
  setLayout = (layout) => this.#layout = layout;
  /**
  * Gets the current layout for the response.
  *
  * @returns The current layout function.
  */
  getLayout = () => this.#layout;
  /**
  * `.setRenderer()` can set the layout in the custom middleware.
  *
  * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
  *
  * @example
  * ```tsx
  * app.use('*', async (c, next) => {
  *   c.setRenderer((content) => {
  *     return c.html(
  *       <html>
  *         <body>
  *           <p>{content}</p>
  *         </body>
  *       </html>
  *     )
  *   })
  *   await next()
  * })
  * ```
  */
  setRenderer = (renderer) => {
    this.#renderer = renderer;
  };
  /**
  * `.header()` can set headers.
  *
  * @see {@link https://hono.dev/docs/api/context#header}
  *
  * @example
  * ```ts
  * app.get('/welcome', (c) => {
  *   // Set headers
  *   c.header('X-Message', 'Hello!')
  *   c.header('Content-Type', 'text/plain')
  *
  *   // Append multiple headers using the append option (e.g. Vary)
  *   c.header('Vary', 'Accept-Encoding', { append: true })
  *   c.header('Vary', 'User-Agent', { append: true })
  *
  *   return c.body('Thank you for coming')
  * })
  * ```
  */
  header = (name, value, options) => {
    if (this.finalized) this.#res = createResponseInstance(this.#res.body, this.#res);
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) headers.delete(name);
    else if (options?.append) headers.append(name, value);
    else headers.set(name, value);
  };
  status = (status) => {
    this.#status = status;
  };
  /**
  * `.set()` can set the value specified by the key.
  *
  * @see {@link https://hono.dev/docs/api/context#set-get}
  *
  * @example
  * ```ts
  * app.use('*', async (c, next) => {
  *   c.set('message', 'Hono is hot!!')
  *   await next()
  * })
  * ```
  */
  set = (key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  };
  /**
  * `.get()` can use the value specified by the key.
  *
  * @see {@link https://hono.dev/docs/api/context#set-get}
  *
  * @example
  * ```ts
  * app.get('/', (c) => {
  *   const message = c.get('message')
  *   return c.text(`The message is "${message}"`)
  * })
  * ```
  */
  get = (key) => {
    return this.#var ? this.#var.get(key) : void 0;
  };
  /**
  * `.var` can access the value of a variable.
  *
  * @see {@link https://hono.dev/docs/api/context#var}
  *
  * @example
  * ```ts
  * const result = c.var.client.oneMethod()
  * ```
  */
  get var() {
    if (!this.#var) return {};
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
    if (typeof arg === "object" && arg.headers) {
      responseHeaders ??= new Headers();
      for (const [key, value] of new Headers(arg.headers)) if (key === "set-cookie") responseHeaders.append(key, value);
      else responseHeaders.set(key, value);
    }
    if (headers) {
      if (!responseHeaders) {
        let count = 0;
        for (const k in headers) if (++count > 1 || typeof headers[k] !== "string") {
          responseHeaders = new Headers();
          break;
        }
      }
      if (responseHeaders) for (const k in headers) {
        const v = headers[k];
        if (typeof v === "string") responseHeaders.set(k, v);
        else {
          responseHeaders.delete(k);
          for (const v2 of v) responseHeaders.append(k, v2);
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, {
      status,
      headers: responseHeaders ?? headers
    });
  }
  newResponse = (...args) => this.#newResponse(...args);
  /**
  * `.body()` can return the HTTP response.
  * You can set headers with `.header()` and set HTTP status code with `.status`.
  * This can also be set in `.text()`, `.json()` and so on.
  *
  * @see {@link https://hono.dev/docs/api/context#body}
  *
  * @example
  * ```ts
  * app.get('/welcome', (c) => {
  *   // Set headers
  *   c.header('X-Message', 'Hello!')
  *   c.header('Content-Type', 'text/plain')
  *   // Set HTTP status code
  *   c.status(201)
  *
  *   // Return the response body
  *   return c.body('Thank you for coming')
  * })
  * ```
  */
  body = (data, arg, headers) => this.#newResponse(data, arg, headers);
  /**
  * `.text()` can render text as `Content-Type:text/plain`.
  *
  * @see {@link https://hono.dev/docs/api/context#text}
  *
  * @example
  * ```ts
  * app.get('/say', (c) => {
  *   return c.text('Hello!')
  * })
  * ```
  */
  text = (text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(text, arg, setDefaultContentType(TEXT_PLAIN, headers));
  };
  /**
  * `.json()` can render JSON as `Content-Type:application/json`.
  *
  * @see {@link https://hono.dev/docs/api/context#json}
  *
  * @example
  * ```ts
  * app.get('/api', (c) => {
  *   return c.json({ message: 'Hello!' })
  * })
  * ```
  */
  json = (object, arg, headers) => {
    return this.#newResponse(JSON.stringify(object), arg, setDefaultContentType("application/json", headers));
  };
  html = (html, arg, headers) => {
    const res = (html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  };
  /**
  * `.redirect()` can Redirect, default status code is 302.
  *
  * @see {@link https://hono.dev/docs/api/context#redirect}
  *
  * @example
  * ```ts
  * app.get('/redirect', (c) => {
  *   return c.redirect('/')
  * })
  * app.get('/redirect-permanently', (c) => {
  *   return c.redirect('/', 301)
  * })
  * ```
  */
  redirect = (location, status) => {
    const locationString = String(location);
    this.header("Location", !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString));
    return this.newResponse(null, status ?? 302);
  };
  /**
  * `.notFound()` can return the Not Found Response.
  *
  * @see {@link https://hono.dev/docs/api/context#notfound}
  *
  * @example
  * ```ts
  * app.get('/notfound', (c) => {
  *   return c.notFound()
  * })
  * ```
  */
  notFound = () => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  };
};

// node_modules/hono/dist/compose.js
var compose = (middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) throw new Error("next() called multiple times");
      index = i;
      let res;
      let isError = false;
      let handler2;
      if (middleware[i]) {
        handler2 = middleware[i][0][0];
        context.req.routeIndex = i;
      } else handler2 = i === middleware.length && next || void 0;
      if (handler2) try {
        res = await handler2(context, () => dispatch(i + 1));
      } catch (err) {
        if (err instanceof Error && onError) {
          context.error = err;
          res = await onError(err, context);
          isError = true;
        } else throw err;
      }
      else if (context.finalized === false && onNotFound) res = await onNotFound(context);
      if (res && (context.finalized === false || isError)) context.res = res;
      return context;
    }
  };
};

// node_modules/hono/dist/router.js
var METHODS = [
  "get",
  "post",
  "put",
  "delete",
  "options",
  "patch",
  "query"
];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = (c) => {
  return c.text("404 Not Found", 404);
};
var errorHandler = (err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
};
var Hono = class Hono2 {
  get;
  post;
  put;
  delete;
  options;
  patch;
  query;
  all;
  on;
  use;
  router;
  getPath;
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    [...METHODS, "all"].forEach((method) => {
      this[method] = (args1, ...args) => {
        const methodName = method.toUpperCase();
        if (typeof args1 === "string") this.#path = args1;
        else this.#addRoute(methodName, this.#path, args1);
        args.forEach((handler2) => {
          this.#addRoute(methodName, this.#path, handler2);
        });
        return this;
      };
    });
    this.on = (method, path2, ...handlers) => {
      for (const p of [path2].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          const methodName = m.toUpperCase();
          for (const handler2 of handlers) this.#addRoute(methodName, this.#path, handler2);
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") this.#path = arg1;
      else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler2) => {
        this.#addRoute("ALL", this.#path, handler2);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new Hono2({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  errorHandler = errorHandler;
  /**
  * `.route()` allows grouping other Hono instance in routes.
  *
  * @see {@link https://hono.dev/docs/api/routing#grouping}
  *
  * @param {string} path - base Path
  * @param {Hono} app - other Hono instance
  * @returns {Hono} routed Hono instance
  *
  * @example
  * ```ts
  * const app = new Hono()
  * const app2 = new Hono()
  *
  * app2.get("/user", (c) => c.text("user"))
  * app.route("/api", app2) // GET /api/user
  * ```
  */
  route(path2, app) {
    const subApp = this.basePath(path2);
    app.routes.map((r) => {
      let handler2;
      if (app.errorHandler === errorHandler) handler2 = r.handler;
      else {
        handler2 = async (c, next) => (await compose([], app.errorHandler)(c, () => r.handler(c, next))).res;
        handler2[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler2, r.basePath);
    });
    return this;
  }
  /**
  * `.basePath()` allows base paths to be specified.
  *
  * @see {@link https://hono.dev/docs/api/routing#base-path}
  *
  * @param {string} path - base Path
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * const api = new Hono().basePath('/api')
  * ```
  */
  basePath(path2) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path2);
    return subApp;
  }
  /**
  * `.onError()` handles an error and returns a customized Response.
  *
  * @see {@link https://hono.dev/docs/api/hono#error-handling}
  *
  * @param {ErrorHandler} handler - request Handler for error
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * app.onError((err, c) => {
  *   console.error(`${err}`)
  *   return c.text('Custom Error Message', 500)
  * })
  * ```
  */
  onError = (handler2) => {
    this.errorHandler = handler2;
    return this;
  };
  /**
  * `.notFound()` allows you to customize a Not Found Response.
  *
  * @see {@link https://hono.dev/docs/api/hono#not-found}
  *
  * @param {NotFoundHandler} handler - request handler for not-found
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * app.notFound((c) => {
  *   return c.text('Custom 404 Message', 404)
  * })
  * ```
  */
  notFound = (handler2) => {
    this.#notFoundHandler = handler2;
    return this;
  };
  /**
  * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
  *
  * @deprecated Use `mount()` from `hono/mount` instead. `.mount()` will be removed in v5.
  *
  * @see {@link https://hono.dev/docs/api/hono#mount}
  *
  * @param {string} path - base Path
  * @param {Function} applicationHandler - other Request Handler
  * @param {MountOptions} [options] - options of `.mount()`
  * @returns {Hono} mounted Hono instance
  *
  * @example
  * ```ts
  * import { Router as IttyRouter } from 'itty-router'
  * import { Hono } from 'hono'
  * // Create itty-router application
  * const ittyRouter = IttyRouter()
  * // GET /itty-router/hello
  * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
  *
  * const app = new Hono()
  * app.mount('/itty-router', ittyRouter.handle)
  * ```
  *
  * @example
  * ```ts
  * const app = new Hono()
  * // Send the request to another application without modification.
  * app.mount('/app', anotherApp, {
  *   replaceRequest: (req) => req,
  * })
  * ```
  */
  mount(path2, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") optionHandler = options;
      else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) replaceRequest = (request) => request;
        else replaceRequest = options.replaceRequest;
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path2);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler2 = async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) return res;
      await next();
    };
    this.#addRoute("ALL", mergePath(path2, "*"), handler2);
    return this;
  }
  #addRoute(method, path2, handler2, baseRoutePath) {
    path2 = mergePath(this._basePath, path2);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path: path2,
      method,
      handler: handler2
    };
    this.router.add(method, path2, [handler2, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) return this.errorHandler(err, c);
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    const path2 = this.getPath(request, { env });
    const matchResult = this.router.match(method, path2);
    const c = new Context(request, {
      path: path2,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then((resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) throw new Error("Context is not finalized. Did you forget to return a Response object or `await next()`?");
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
  * `.fetch()` will be entry point of your app.
  *
  * @see {@link https://hono.dev/docs/api/hono#fetch}
  *
  * @param {Request} request - request Object of request
  * @param {Env} env - env Object
  * @param {ExecutionContext} executionCtx - context of execution
  * @returns {Response | Promise<Response>} response of request
  *
  */
  fetch = (request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  };
  /**
  * `.request()` is a useful method for testing.
  * You can pass a URL or pathname to send a GET request.
  * app will return a Response object.
  * ```ts
  * test('GET /hello is ok', async () => {
  *   const res = await app.request('/hello')
  *   expect(res.status).toBe(200)
  * })
  * ```
  * @see https://hono.dev/docs/api/hono#request
  */
  request = (input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    input = input.toString();
    return this.fetch(new Request(/^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`, requestInit), Env, executionCtx);
  };
  /**
  * `.fire()` automatically adds a global fetch event listener.
  * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
  * @deprecated
  * Use `fire` from `hono/service-worker` instead.
  * ```ts
  * import { Hono } from 'hono'
  * import { fire } from 'hono/service-worker'
  *
  * const app = new Hono()
  * // ...
  * fire(app)
  * ```
  * @see https://hono.dev/docs/api/hono#fire
  * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
  * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
  */
  fire = () => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  };
};

// node_modules/hono/dist/router/utils.js
var createNullObject = () => /* @__PURE__ */ Object.create(null);

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path2) {
  const matchers = this.buildAllMatchers();
  const match2 = ((method2, path3) => {
    const matcher = matchers[method2] || matchers["ALL"];
    const staticMatch = matcher[2][path3];
    if (staticMatch) return staticMatch;
    const match3 = path3.match(matcher[0]);
    if (!match3) return [[], emptyParam];
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  });
  this.match = match2;
  return match2(method, path2);
}

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = /* @__PURE__ */ new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) return b.length === 1 ? a < b ? -1 : 1 : -1;
  if (b.length === 1) return 1;
  if (a === ".*" || a === "(?:|/.*)") return b === "(?:|/.*)" ? -1 : 1;
  else if (b === ".*" || b === "(?:|/.*)") return -1;
  if (a === "[^/]+") return 1;
  else if (b === "[^/]+") return -1;
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var Node = class Node2 {
  #index;
  #varIndex;
  #children = createNullObject();
  insert(tokens, index, paramMap, context, isStatic) {
    let node = this;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? [
        "",
        "",
        ".*"
      ] : [
        "",
        "",
        LABEL_REG_EXP_STR
      ] : null : token === "/*" ? [
        "",
        "",
        TAIL_WILDCARD_REG_EXP_STR
      ] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
      let nextNode;
      if (pattern) {
        const name = pattern[1];
        let regexpStr = pattern[2] || "[^/]+";
        if (name && pattern[2]) {
          if (regexpStr === ".*") throw PATH_ERROR;
          regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
          if (/\((?!\?:)/.test(regexpStr)) throw PATH_ERROR;
          if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) throw PATH_ERROR;
        }
        nextNode = node.#children[regexpStr];
        if (!nextNode) {
          if (regexpStr !== ".*" && regexpStr !== "(?:|/.*)") {
            for (const k in node.#children) if ((regexpStr.length > 1 || k.length > 1) && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
          }
          nextNode = node.#children[regexpStr] = new Node2();
        }
        if (name !== "") {
          nextNode.#varIndex ??= context.varIndex++;
          paramMap.push([name, nextNode.#varIndex]);
        }
      } else {
        nextNode = node.#children[token];
        if (!nextNode) {
          for (const k in node.#children) if (k.length > 1 && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
          nextNode = node.#children[token] = new Node2();
        }
      }
      node = nextNode;
    }
    if (node.#index !== void 0) throw PATH_ERROR;
    node.#index = isStatic ? -1 : index;
  }
  buildRegExpStr() {
    const strList = Object.keys(this.#children).sort(compareKey).map((k) => {
      const c = this.#children[k];
      const childStr = c.buildRegExpStr();
      return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
    }).filter(Boolean);
    if (typeof this.#index === "number" && this.#index !== -1) strList.unshift(`#${this.#index}`);
    if (strList.length === 0) return "";
    if (strList.length === 1) return strList[0];
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  #context = { varIndex: 0 };
  #root = new Node();
  #index = 0;
  paths = createNullObject();
  insert(path2, isStatic) {
    if (isStatic) {
      this.#root.insert(path2.split(""), 0, [], this.#context, true);
      return;
    }
    const paramAssoc = [];
    const groups = [];
    let markedPath = path2;
    for (let i = 0; ; ) {
      let replaced = false;
      markedPath = markedPath.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) break;
    }
    const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) if (tokens[j].indexOf(mark) !== -1) {
        tokens[j] = tokens[j].replace(mark, groups[i][1]);
        break;
      }
    }
    this.#root.insert(tokens, this.#index, paramAssoc, this.#context, false);
    this.paths[path2] = [this.#index++, paramAssoc];
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") return [
      /^$/,
      [],
      []
    ];
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [
      new RegExp(`^${regexp}`),
      indexReplacementMap,
      paramReplacementMap
    ];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var wildcardRegExpCache = createNullObject();
function buildWildcardRegExp(path2) {
  return wildcardRegExpCache[path2] ??= new RegExp(`^${path2.replace(/\/:[^/{}]+(?:\{\[\^\/]\+})?(?=[/{]|$)|\/?\*$|([.\\+*[^\]$()?{}|])/g, (match2, metaChar) => metaChar ? `\\${metaChar}` : match2 === "/*" ? TAIL_WILDCARD_REG_EXP_STR : match2 === "*" ? ".*" : `/:${LABEL_REG_EXP_STR}`)}$`);
}
function findMiddleware(middleware, path2) {
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) if (buildWildcardRegExp(k).test(path2)) return [...middleware[k]];
}
var RegExpRouter = class {
  name = "RegExpRouter";
  #middleware;
  #routes;
  #tries;
  constructor() {
    this.#middleware = { ["ALL"]: createNullObject() };
    this.#routes = { ["ALL"]: createNullObject() };
    this.#tries = { ["ALL"]: new Trie() };
  }
  #insertPath(method, path2) {
    try {
      this.#tries[method].insert(path2, !/\*|\/:/.test(path2));
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path2) : e;
    }
  }
  add(method, path2, handler2) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    if (!middleware[method]) {
      this.#tries[method] = new Trie();
      for (const handlerMap of [middleware, routes]) {
        handlerMap[method] = createNullObject();
        for (const p in handlerMap["ALL"]) {
          handlerMap[method][p] = [...handlerMap["ALL"][p]];
          this.#insertPath(method, p);
        }
      }
    }
    if (path2 === "/*") path2 = "*";
    const methods = method === "ALL" ? Object.keys(middleware) : [method];
    if (/\*$/.test(path2)) {
      const re = buildWildcardRegExp(path2);
      for (const m of methods) if (!middleware[m][path2]) {
        this.#insertPath(m, path2);
        middleware[m][path2] = findMiddleware(middleware[m], path2) || findMiddleware(middleware["ALL"], path2) || [];
      }
      for (const handlerMap of [middleware, routes]) for (const m of methods) for (const p in handlerMap[m]) re.test(p) && handlerMap[m][p].push([handler2, path2]);
      return;
    }
    const paths = checkOptionalParameter(path2) || [path2];
    for (const path3 of paths) for (const m of methods) {
      if (!routes[m][path3]) {
        this.#insertPath(m, path3);
        routes[m][path3] = findMiddleware(middleware[m], path3) || findMiddleware(middleware["ALL"], path3) || [];
      }
      routes[m][path3].push([handler2, path3]);
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = createNullObject();
    for (const method of Object.keys(this.#routes)) matchers[method] = this.#buildMatcher(method);
    this.#middleware = this.#routes = this.#tries = void 0;
    wildcardRegExpCache = createNullObject();
    return matchers;
  }
  #buildMatcher(method) {
    const middleware = this.#middleware[method];
    const routes = this.#routes[method];
    const trie = this.#tries[method];
    const staticMap = createNullObject();
    const handlerData = [];
    const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
    for (const r of [middleware, routes]) for (const path2 in r) {
      const handlers = r[path2];
      const pathData = trie.paths[path2];
      if (!pathData) {
        staticMap[path2] = [handlers.map(([h]) => [h, createNullObject()]), emptyParam];
        continue;
      }
      handlerData[pathData[0]] = handlers.map(([h, handlerPath]) => [h, trie.paths[handlerPath][1].reduceRight((map, [key], i) => {
        map[key] = paramReplacementMap[pathData[1][i][1]];
        return map;
      }, createNullObject())]);
    }
    return [
      regexp,
      indexReplacementMap.map((i) => handlerData[i]),
      staticMap
    ];
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path2, handler2) {
    if (!this.#routes) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    this.#routes.push([
      method,
      path2,
      handler2
    ]);
  }
  match(method, path2) {
    if (!this.#routes) throw new Error("Fatal error");
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) router.add(...routes[i2]);
        res = router.match(method, path2);
      } catch (e) {
        if (e instanceof UnsupportedPathError) continue;
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) throw new Error("Fatal error");
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) throw new Error("No active router has been determined yet.");
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = createNullObject();
var order = 0;
var Node3 = class Node4 {
  #methods = [];
  #children = createNullObject();
  #patterns = [];
  #pattern;
  #params = emptyParams;
  insert(method, path2, handler2) {
    let curNode = this;
    const parts = splitRoutingPath(path2);
    const possibleKeys = /* @__PURE__ */ new Set();
    let i = 0;
    for (const p of parts) {
      const nextP = parts[++i];
      const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
      const isParam = Array.isArray(pattern);
      const key = isParam ? pattern[0] : pattern || p;
      const child = curNode.#children[key] ||= new Node4();
      if (pattern && !child.#pattern) {
        child.#pattern = pattern;
        curNode.#patterns.push(child);
      }
      curNode = child;
      if (isParam) possibleKeys.add(pattern[1]);
    }
    curNode.#methods.push({ [method]: {
      handler: handler2,
      possibleKeys: [...possibleKeys],
      score: ++order
    } });
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m["ALL"];
      if (handlerSet) {
        handlerSet.params = createNullObject();
        handlerSets.push(handlerSet);
        for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
          const key = handlerSet.possibleKeys[i2];
          handlerSet.params[key] = params?.[key] && !i2 ? params[key] : nodeParams[key] ?? params?.[key];
        }
      }
    }
  }
  search(method, path2) {
    const handlerSets = [];
    this.#params = emptyParams;
    let curNodes = [this];
    const parts = splitPath(path2);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else tempNodes.push(nextNode);
        }
        for (const child of node.#patterns) {
          const pattern = child.#pattern;
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (typeof pattern === "string") {
            if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
              this.#pushHandlerSets(handlerSets, child, method, node.#params);
              if (pattern === "*") {
                child.#params = params;
                tempNodes.push(child);
              }
            }
            continue;
          }
          const [, name, matcher] = pattern;
          if (!part && matcher === true) continue;
          if (matcher !== true) {
            if (!partOffsets) {
              partOffsets = [];
              let offset = path2[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path2.slice(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              if (!Object.hasOwn(params, name)) params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, node.#params, params);
              for (const _ in child.#children) {
                child.#params = params;
                const componentCount = m[0].match(/\//g)?.length ?? 0;
                (curNodesQueue[componentCount] ||= []).push(child);
                break;
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            if (!Object.hasOwn(params, name)) params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, params, node.#params);
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets[1]) handlerSets.sort((a, b) => {
      return a.score - b.score;
    });
    return [handlerSets.map(({ handler: handler2, params }) => [handler2, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  name = "TrieRouter";
  #node = new Node3();
  add(method, path2, handler2) {
    for (const result of checkOptionalParameter(path2) || [path2]) this.#node.insert(method, result, handler2);
  }
  match(method, path2) {
    return this.#node.search(method, path2);
  }
};

// node_modules/hono/dist/hono.js
var Hono3 = class extends Hono {
  /**
  * Creates an instance of the Hono class.
  *
  * @param options - Optional configuration options for the Hono instance.
  */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({ routers: [new RegExpRouter(), new TrieRouter()] });
  }
};

// apps/api/src/auth.ts
import { createHash, timingSafeEqual } from "node:crypto";

// apps/api/src/errors.ts
var ErrorCode = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  DUPLICATE_IDEMPOTENCY: "DUPLICATE_IDEMPOTENCY",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  WORKER_NOT_FOUND: "WORKER_NOT_FOUND",
  INVALID_ADDRESS: "INVALID_ADDRESS",
  BATCH_PARTIAL: "BATCH_PARTIAL",
  CHAIN_UNAVAILABLE: "CHAIN_UNAVAILABLE",
  BATCH_UNKNOWN: "BATCH_UNKNOWN",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL"
};
var STATUS_BY_CODE = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  // 400 chứ không 422: spec `docs/specs/nhip-mvp.md` chốt 400 cho input sai, và
  // người tích hợp đã viết code bắt 400. Đổi thành 422 là breaking change không có lý do.
  VALIDATION_FAILED: 400,
  DUPLICATE_IDEMPOTENCY: 409,
  INSUFFICIENT_BALANCE: 409,
  WORKER_NOT_FOUND: 404,
  INVALID_ADDRESS: 400,
  BATCH_PARTIAL: 207,
  CHAIN_UNAVAILABLE: 503,
  BATCH_UNKNOWN: 500,
  RATE_LIMITED: 429,
  INTERNAL: 500
};
var AppError = class extends Error {
  code;
  status;
  details;
  constructor(code, message, details) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
  toBody(requestId) {
    const body = {
      error: {
        code: this.code,
        message: this.message,
        requestId
      }
    };
    if (this.details) body.error.details = this.details;
    return body;
  }
};
function toAppError(error) {
  if (error instanceof AppError) return error;
  if (error instanceof Error && error.name === "ValidationError" && "fields" in error) {
    const fields = error.fields;
    return new AppError(ErrorCode.VALIDATION_FAILED, error.message, {
      fields: Array.isArray(fields) ? fields : []
    });
  }
  if (error instanceof Error && error.name === "RequestKeyConflictError") {
    return new AppError(ErrorCode.DUPLICATE_IDEMPOTENCY, error.message);
  }
  if (error instanceof Error && isUserFacingError(error)) {
    return new AppError(ErrorCode.VALIDATION_FAILED, error.message);
  }
  return new AppError(ErrorCode.INTERNAL, "L\u1ED7i h\u1EC7 th\u1ED1ng. Vui l\xF2ng th\u1EED l\u1EA1i; n\u1EBFu v\u1EABn l\u1ED7i, li\xEAn h\u1EC7 h\u1ED7 tr\u1EE3.");
}
function isUserFacingError(error) {
  const name = error.name;
  return name === "MoneyFormatError" || name === "AddressError" || name === "BatchPlanError" || name === "CursorError";
}

// apps/api/src/auth.ts
function hashApiKey(key) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}
var BEARER_PATTERN = /^Bearer\s+(.+)$/i;
function extractApiKey(header) {
  if (!header) {
    throw new AppError(ErrorCode.UNAUTHENTICATED, "Thi\u1EBFu header Authorization. D\xF9ng: Bearer <api_key>.");
  }
  const match2 = BEARER_PATTERN.exec(header.trim());
  if (!match2?.[1]) {
    throw new AppError(ErrorCode.UNAUTHENTICATED, "Header Authorization ph\u1EA3i c\xF3 d\u1EA1ng: Bearer <api_key>.");
  }
  return match2[1].trim();
}
async function authenticate(db, authorizationHeader) {
  const key = extractApiKey(authorizationHeader);
  if (key.length < 16) {
    throw new AppError(ErrorCode.UNAUTHENTICATED, "API key kh\xF4ng h\u1EE3p l\u1EC7.");
  }
  const result = await db.query(
    `SELECT id, name, batch_size, batch_interval_ms, gas_budget
       FROM platforms WHERE api_key_hash = $1`,
    [hashApiKey(key)]
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError(ErrorCode.UNAUTHENTICATED, "API key kh\xF4ng h\u1EE3p l\u1EC7.");
  }
  return {
    id: row.id,
    name: row.name,
    batchSize: row.batch_size,
    batchIntervalMs: row.batch_interval_ms,
    gasBudget: BigInt(row.gas_budget)
  };
}

// apps/api/src/batches.route.ts
import { createHash as createHash2 } from "node:crypto";

// packages/core/src/batching.ts
var BatchPlanError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "BatchPlanError";
  }
};
function planBatches(items, options) {
  const { gasBudget, gasPerPayout, maxBatchSize } = options;
  if (gasPerPayout <= 0n) throw new BatchPlanError("gasPerPayout ph\u1EA3i > 0");
  if (gasBudget < gasPerPayout) {
    throw new BatchPlanError(
      `gasBudget (${gasBudget}) nh\u1ECF h\u01A1n gas c\u1EE7a m\u1ED9t payout (${gasPerPayout}) \u2014 kh\xF4ng l\xF4 n\xE0o ch\u1EA1y \u0111\u01B0\u1EE3c`
    );
  }
  if (!Number.isInteger(maxBatchSize) || maxBatchSize < 1) {
    throw new BatchPlanError("maxBatchSize ph\u1EA3i l\xE0 s\u1ED1 nguy\xEAn >= 1");
  }
  const byGas = Number(gasBudget / gasPerPayout);
  const size2 = Math.min(byGas, maxBatchSize);
  if (items.length === 0) return { batches: [], gasPerBatch: [] };
  const batches = [];
  const gasPerBatch = [];
  for (let index = 0; index < items.length; index += size2) {
    const slice = items.slice(index, index + size2);
    batches.push(slice);
    gasPerBatch.push(BigInt(slice.length) * gasPerPayout);
  }
  return { batches, gasPerBatch };
}

// packages/core/src/ids.ts
var PREFIX_PATTERN = /^[a-z]{2,6}$/;
function newId(prefix) {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new Error(`ti\u1EC1n t\u1ED1 id kh\xF4ng h\u1EE3p l\u1EC7: ${JSON.stringify(prefix)} \u2014 ph\u1EA3i l\xE0 2-6 ch\u1EEF th\u01B0\u1EDDng`);
  }
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}
var ID_PREFIX = {
  PAYOUT: "pay",
  BATCH: "bat",
  PLATFORM: "plat",
  WORKER: "wrk",
  REQUEST: "req"
};

// packages/core/src/money.ts
function micro(value) {
  return value;
}
function sum(values) {
  let total = 0n;
  for (const value of values) total += value;
  return micro(total);
}

// apps/api/src/batches.repo.ts
var SELECT_COLUMNS = "id, state, payout_count, total_micro::text AS total_micro, estimated_gas::text AS estimated_gas, request_key, request_hash, chunk_index, tx_hash, created_at";
var RequestKeyConflictError = class extends Error {
  storedHash;
  incomingHash;
  constructor(storedHash, incomingHash) {
    super(
      "Idempotency-Key n\xE0y \u0111\xE3 \u0111\u01B0\u1EE3c d\xF9ng cho m\u1ED9t request c\xF3 n\u1ED9i dung kh\xE1c. D\xF9ng key m\u1EDBi cho payout m\u1EDBi; key c\u0169 ch\u1EC9 d\xF9ng l\u1EA1i khi retry \u0111\xFAng request c\u0169."
    );
    this.name = "RequestKeyConflictError";
    this.storedHash = storedHash;
    this.incomingHash = incomingHash;
  }
};
async function createBatchRequest(tx, platformId, input) {
  const { requestKey, requestHash, plan } = input;
  const existing = await findBatchesByRequestKey(tx, platformId, requestKey);
  if (existing.length > 0) {
    const storedHash = existing[0]?.request_hash ?? null;
    if (storedHash !== null && storedHash !== requestHash) {
      throw new RequestKeyConflictError(storedHash, requestHash);
    }
    return { batches: existing, duplicate: true };
  }
  const allPayouts = plan.flatMap((batch) => batch.payouts);
  const total = sum(allPayouts.map((payout) => payout.amountMicro));
  const created = [];
  for (let index = 0; index < plan.length; index++) {
    const batch = plan[index];
    if (!batch) continue;
    const chunkTotal = sum(batch.payouts.map((payout) => payout.amountMicro));
    for (const payout of batch.payouts) {
      await tx.query(
        `INSERT INTO payouts (id, platform_id, worker_id, amount_micro, idempotency_key, reference)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          payout.id,
          platformId,
          payout.workerId,
          payout.amountMicro.toString(),
          payout.idempotencyKey,
          payout.reference ?? null
        ]
      );
    }
    const inserted = await tx.query(
      `INSERT INTO batches
         (id, platform_id, payout_count, total_micro, estimated_gas,
          idempotency_key, request_key, request_hash, chunk_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${SELECT_COLUMNS}`,
      [
        batch.batchId,
        platformId,
        batch.payouts.length,
        chunkTotal.toString(),
        batch.estimatedGas.toString(),
        `batch:${requestKey}#${index}`,
        requestKey,
        requestHash,
        index
      ]
    );
    const row = inserted.rows[0];
    if (!row) throw new Error("createBatchRequest: INSERT ... RETURNING kh\xF4ng tr\u1EA3 d\xF2ng n\xE0o");
    const placeholders = batch.payouts.map((_, position) => `$${position + 3}`).join(", ");
    const updated = await tx.query(
      `UPDATE payouts
          SET batch_id = $1, state = 'batched'
        WHERE platform_id = $2 AND id IN (${placeholders}) AND state = 'queued'`,
      [batch.batchId, platformId, ...batch.payouts.map((payout) => payout.id)]
    );
    if (updated.rowCount !== batch.payouts.length) {
      throw new Error(
        `batch ${batch.batchId}: g\xE1n \u0111\u01B0\u1EE3c ${updated.rowCount}/${batch.payouts.length} payout. C\xF3 payout kh\xF4ng \u1EDF tr\u1EA1ng th\xE1i queued \u2014 d\u1EEBng l\u1EA1i thay v\xEC t\u1EA1o l\xF4 n\xF3i d\u1ED1i v\u1EC1 s\u1ED1 l\u01B0\u1EE3ng.`
      );
    }
    created.push(row);
  }
  const sumOfBatches = sum(created.map((row) => BigInt(row.total_micro)));
  if (sumOfBatches !== total) {
    throw new Error(`t\u1ED5ng l\xF4 (${sumOfBatches}) != t\u1ED5ng payout (${total}) \u2014 rollback`);
  }
  return { batches: created, duplicate: false };
}
async function findBatchesByRequestKey(db, platformId, requestKey) {
  const result = await db.query(
    `SELECT ${SELECT_COLUMNS} FROM batches
      WHERE platform_id = $1 AND request_key = $2
      ORDER BY chunk_index ASC`,
    [platformId, requestKey]
  );
  return result.rows;
}
async function findBatchById(db, platformId, id) {
  const result = await db.query(
    `SELECT ${SELECT_COLUMNS} FROM batches WHERE id = $1 AND platform_id = $2`,
    [id, platformId]
  );
  return result.rows[0] ?? null;
}
var PAYOUT_COLUMNS = "id, worker_id, amount_micro::text AS amount_micro, state, reference";
async function listBatchPayouts(db, platformId, batchId) {
  const result = await db.query(
    `SELECT ${PAYOUT_COLUMNS} FROM payouts
      WHERE platform_id = $1 AND batch_id = $2
      ORDER BY created_at ASC, id ASC`,
    [platformId, batchId]
  );
  return result.rows;
}
async function listRequestPayouts(db, platformId, requestKey) {
  const result = await db.query(
    `SELECT p.id, p.worker_id, p.amount_micro::text AS amount_micro, p.state, p.reference
       FROM payouts p
       JOIN batches b ON b.id = p.batch_id AND b.platform_id = p.platform_id
      WHERE p.platform_id = $1 AND b.request_key = $2
      ORDER BY b.chunk_index ASC, p.created_at ASC, p.id ASC`,
    [platformId, requestKey]
  );
  return result.rows;
}

// apps/api/src/gas.ts
var GAS_PER_PAYOUT_ESTIMATE = 28000n;

// apps/api/src/queue.repo.ts
async function claimQueuedPayouts(tx, platformId, limit) {
  const result = await tx.query(
    `SELECT id, amount_micro::text AS amount_micro
       FROM payouts
      WHERE platform_id = $1 AND state = 'queued'
      ORDER BY created_at ASC, id ASC
      LIMIT $2
      FOR UPDATE SKIP LOCKED`,
    [platformId, limit]
  );
  return result.rows;
}
var SELECT_COLUMNS2 = "id, state, payout_count, total_micro::text AS total_micro, estimated_gas::text AS estimated_gas, request_key, request_hash, chunk_index, tx_hash, created_at";
async function createBatchesFromQueue(tx, platformId, requestKey, chunks, amountsById) {
  const batches = [];
  let payoutCount = 0;
  let totalMicro = 0n;
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    if (!chunk) continue;
    const chunkAmounts = chunk.payoutIds.map((id) => amountsById.get(id) ?? 0n);
    const chunkTotal = sum(chunkAmounts);
    const inserted = await tx.query(
      `INSERT INTO batches
         (id, platform_id, state, payout_count, total_micro, estimated_gas,
          idempotency_key, request_key, chunk_index)
       VALUES ($1, $2, 'planned', $3, $4, $5, $6, $7, $8)
       RETURNING ${SELECT_COLUMNS2}`,
      [
        chunk.batchId,
        platformId,
        chunk.payoutIds.length,
        chunkTotal.toString(),
        chunk.estimatedGas.toString(),
        `batch:${requestKey}#${index}`,
        requestKey,
        index
      ]
    );
    const row = inserted.rows[0];
    if (!row) throw new Error("createBatchesFromQueue: INSERT ... RETURNING kh\xF4ng tr\u1EA3 d\xF2ng n\xE0o");
    const placeholders = chunk.payoutIds.map((_, position) => `$${position + 3}`).join(", ");
    const updated = await tx.query(
      `UPDATE payouts SET batch_id = $1, state = 'batched'
        WHERE platform_id = $2 AND id IN (${placeholders}) AND state = 'queued'`,
      [chunk.batchId, platformId, ...chunk.payoutIds]
    );
    if (updated.rowCount !== chunk.payoutIds.length) {
      throw new Error(
        `batch ${chunk.batchId}: ch\u1EC9 g\xE1n \u0111\u01B0\u1EE3c ${updated.rowCount}/${chunk.payoutIds.length} payout. C\xF3 payout v\u1EEBa b\u1ECB worker kh\xE1c l\u1EA5y. Rollback \u0111\u1EC3 l\u1EA7n gom sau nh\u1EB7t l\u1EA1i \u2014 th\xE0 ch\u1EADm m\u1ED9t nh\u1ECBp c\xF2n h\u01A1n t\u1EA1o l\xF4 n\xF3i d\u1ED1i v\u1EC1 s\u1ED1 ng\u01B0\u1EDDi \u0111\u01B0\u1EE3c tr\u1EA3.`
      );
    }
    batches.push(row);
    payoutCount += chunk.payoutIds.length;
    totalMicro = totalMicro + chunkTotal;
  }
  return { batches, payoutCount, totalMicro: totalMicro.toString() };
}

// node_modules/viem/_esm/index.js
init_getAddress();

// packages/core/src/address.ts
var ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
var AddressError = class extends Error {
  input;
  constructor(input, reason) {
    super(`\u0110\u1ECBa ch\u1EC9 kh\xF4ng h\u1EE3p l\u1EC7 (${reason}): ${JSON.stringify(input)}`);
    this.name = "AddressError";
    this.input = input;
  }
};
function normalizeAddress(input) {
  if (typeof input !== "string") throw new AddressError(String(input), "kh\xF4ng ph\u1EA3i chu\u1ED7i");
  const trimmed = input.trim();
  if (trimmed === "") throw new AddressError(input, "r\u1ED7ng");
  if (!trimmed.startsWith("0x")) throw new AddressError(input, "thi\u1EBFu ti\u1EC1n t\u1ED1 0x");
  if (trimmed.length !== 42) throw new AddressError(input, "ph\u1EA3i d\xE0i 42 k\xFD t\u1EF1");
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) throw new AddressError(input, "kh\xF4ng ph\u1EA3i hex 20 byte");
  const body = trimmed.slice(2);
  const hasLower = /[a-f]/.test(body);
  const hasUpper = /[A-F]/.test(body);
  if (hasLower && hasUpper && getAddress(trimmed) !== trimmed) {
    throw new AddressError(input, "sai checksum EIP-55 (c\xF3 th\u1EC3 g\xF5 nh\u1EA7m 1 k\xFD t\u1EF1)");
  }
  const lower = trimmed.toLowerCase();
  if (lower === ZERO_ADDRESS) throw new AddressError(input, "kh\xF4ng \u0111\u01B0\u1EE3c l\xE0 zero address (Arc revert)");
  return lower;
}

// apps/api/src/validate.ts
var ValidationError = class extends Error {
  fields;
  constructor(fields) {
    super(`Payload kh\xF4ng h\u1EE3p l\u1EC7: ${fields.map((f) => f.field).join(", ")}`);
    this.name = "ValidationError";
    this.fields = fields;
  }
};
var FieldCollector = class {
  #errors = [];
  add(field, message) {
    this.#errors.push({ field, message });
  }
  get errors() {
    return this.#errors;
  }
  get hasErrors() {
    return this.#errors.length > 0;
  }
  throwIfAny() {
    if (this.#errors.length > 0) throw new ValidationError(this.#errors);
  }
};
function newCollector() {
  return new FieldCollector();
}
function requireObject(value, collector, field = "(body)") {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    collector.add(field, "Ph\u1EA3i l\xE0 JSON object.");
    return null;
  }
  return value;
}
async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    throw new ValidationError([
      { field: "(body)", message: "Body kh\xF4ng ph\u1EA3i JSON h\u1EE3p l\u1EC7. Ki\u1EC3m Content-Type v\xE0 d\u1EA5u ngo\u1EB7c." }
    ]);
  }
}
function takeString(source, field, collector, options = {}) {
  const { min = 1, max = 500, required = true } = options;
  const raw2 = source[field];
  if (raw2 === void 0 || raw2 === null) {
    if (required) collector.add(field, `Thi\u1EBFu tr\u01B0\u1EDDng "${field}".`);
    return null;
  }
  if (typeof raw2 !== "string") {
    collector.add(field, `"${field}" ph\u1EA3i l\xE0 chu\u1ED7i.`);
    return null;
  }
  const trimmed = raw2.trim();
  if (trimmed.length < min) {
    collector.add(field, `"${field}" ph\u1EA3i c\xF3 \xEDt nh\u1EA5t ${min} k\xFD t\u1EF1.`);
    return null;
  }
  if (trimmed.length > max) {
    collector.add(field, `"${field}" kh\xF4ng \u0111\u01B0\u1EE3c d\xE0i qu\xE1 ${max} k\xFD t\u1EF1.`);
    return null;
  }
  return trimmed;
}
var MICRO_INTEGER_PATTERN = /^\d{1,18}$/;
function takeAmountMicro(source, field, collector) {
  const raw2 = source[field];
  if (raw2 === void 0 || raw2 === null) {
    collector.add(field, `Thi\u1EBFu tr\u01B0\u1EDDng "${field}".`);
    return null;
  }
  if (typeof raw2 === "number") {
    collector.add(
      field,
      `"${field}" ph\u1EA3i l\xE0 chu\u1ED7i s\u1ED1 nguy\xEAn micro-USDC (v\xED d\u1EE5 "1650750000"), kh\xF4ng ph\u1EA3i number \u2014 JSON number \u0111i qua float c\u1EE7a JavaScript v\xE0 m\u1EA5t ch\xEDnh x\xE1c tr\u01B0\u1EDBc khi ta k\u1ECBp ki\u1EC3m.`
    );
    return null;
  }
  if (typeof raw2 !== "string") {
    collector.add(field, `"${field}" ph\u1EA3i l\xE0 chu\u1ED7i.`);
    return null;
  }
  const trimmed = raw2.trim();
  if (!MICRO_INTEGER_PATTERN.test(trimmed)) {
    const hint = trimmed.includes(".") || trimmed.includes(",") ? 'C\xF3 d\u1EA5u th\u1EADp ph\xE2n. Tr\u01B0\u1EDDng n\xE0y t\xEDnh b\u1EB1ng micro (1e-6 USDC): 1.65075 USDC = "1650750".' : "Ch\u1EC9 \u0111\u01B0\u1EE3c ch\u1EE9a ch\u1EEF s\u1ED1 0-9, t\u1ED1i \u0111a 18 ch\u1EEF s\u1ED1.";
    collector.add(field, `"${field}" kh\xF4ng h\u1EE3p l\u1EC7. ${hint}`);
    return null;
  }
  const value = BigInt(trimmed);
  if (value <= 0n) {
    collector.add(field, `"${field}" ph\u1EA3i l\u1EDBn h\u01A1n 0.`);
    return null;
  }
  return micro(value);
}
function takeAddress(source, field, collector, options = {}) {
  const { required = true } = options;
  const raw2 = source[field];
  if (raw2 === void 0 || raw2 === null) {
    if (required) collector.add(field, `Thi\u1EBFu tr\u01B0\u1EDDng "${field}".`);
    return null;
  }
  if (typeof raw2 !== "string") {
    collector.add(field, `"${field}" ph\u1EA3i l\xE0 chu\u1ED7i.`);
    return null;
  }
  if (raw2.trim() === "" && !required) return null;
  try {
    return normalizeAddress(raw2);
  } catch (error) {
    collector.add(
      field,
      error instanceof AddressError ? error.message : `"${field}" kh\xF4ng ph\u1EA3i \u0111\u1ECBa ch\u1EC9 h\u1EE3p l\u1EC7.`
    );
    return null;
  }
}
function requireIdempotencyKey(header) {
  if (!header || header.trim() === "") {
    throw new ValidationError([
      {
        field: "Idempotency-Key",
        message: 'Thi\u1EBFu header "Idempotency-Key". Sinh m\u1ED9t gi\xE1 tr\u1ECB duy nh\u1EA5t cho m\u1ED7i payout (v\xED d\u1EE5 UUID) v\xE0 d\xF9ng l\u1EA1i \u0111\xFAng gi\xE1 tr\u1ECB \u0111\xF3 khi retry.'
      }
    ]);
  }
  const key = header.trim();
  if (key.length < 8 || key.length > 200) {
    throw new ValidationError([{ field: "Idempotency-Key", message: "Ph\u1EA3i d\xE0i t\u1EEB 8 \u0111\u1EBFn 200 k\xFD t\u1EF1." }]);
  }
  if (!/^[\x20-\x7E]+$/.test(key)) {
    throw new ValidationError([
      {
        field: "Idempotency-Key",
        message: "Ch\u1EC9 d\xF9ng k\xFD t\u1EF1 ASCII in \u0111\u01B0\u1EE3c. Key c\xF3 d\u1EA5u ti\u1EBFng Vi\u1EC7t s\u1EBD h\u1ECFng khi qua m\u1ED9t s\u1ED1 proxy."
      }
    ]);
  }
  return key;
}
function takeLimit(raw2, collector, options) {
  const { field = "limit", fallback, max } = options;
  if (raw2 === void 0 || raw2 === "") return fallback;
  if (!/^\d{1,6}$/.test(raw2)) {
    collector.add(field, `"${field}" ph\u1EA3i l\xE0 s\u1ED1 nguy\xEAn d\u01B0\u01A1ng.`);
    return null;
  }
  const value = Number(raw2);
  if (value < 1) {
    collector.add(field, `"${field}" ph\u1EA3i >= 1.`);
    return null;
  }
  if (value > max) {
    collector.add(field, `"${field}" kh\xF4ng \u0111\u01B0\u1EE3c v\u01B0\u1EE3t ${max}.`);
    return null;
  }
  return value;
}

// apps/api/src/batches.route.ts
var MAX_PAYOUTS_PER_REQUEST = 5e3;
function toBatchBody(row) {
  return {
    id: row.id,
    state: row.state,
    payoutCount: row.payout_count,
    total_micro: row.total_micro,
    estimatedGas: row.estimated_gas,
    chunkIndex: row.chunk_index,
    txHash: row.tx_hash,
    created_at: row.created_at.toISOString()
  };
}
function hashRequest(payouts) {
  const canonical = payouts.map((payout) => [
    payout.index,
    payout.workerId,
    payout.amountMicro.toString(),
    payout.reference ?? ""
  ]);
  return createHash2("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}
function createBatchRoutes(options) {
  const { db } = options;
  const routes = new Hono3();
  routes.post("/", async (c) => {
    const platform = c.get("platform");
    const idempotencyKey = requireIdempotencyKey(c.req.header("idempotency-key"));
    const body = await readJsonBody(c.req);
    const collector = newCollector();
    const source = requireObject(body, collector);
    if (!source) {
      collector.throwIfAny();
      throw new AppError(ErrorCode.INTERNAL, "Body kh\xF4ng ph\u1EA3i object nh\u01B0ng kh\xF4ng c\xF3 l\u1ED7i \u2014 l\u1ED7i logic.");
    }
    const rawPayouts = source.payouts;
    if (!Array.isArray(rawPayouts)) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, "Payload kh\xF4ng h\u1EE3p l\u1EC7: payouts", {
        fields: [{ field: "payouts", message: "Ph\u1EA3i l\xE0 m\u1EA3ng c\xE1c payout." }]
      });
    }
    if (rawPayouts.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, "Payload kh\xF4ng h\u1EE3p l\u1EC7: payouts", {
        fields: [{ field: "payouts", message: "M\u1EA3ng r\u1ED7ng th\xEC kh\xF4ng c\xF3 g\xEC \u0111\u1EC3 tr\u1EA3 l\u01B0\u01A1ng." }]
      });
    }
    if (rawPayouts.length > MAX_PAYOUTS_PER_REQUEST) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, "Payload kh\xF4ng h\u1EE3p l\u1EC7: payouts", {
        fields: [
          {
            field: "payouts",
            message: `T\u1ED1i \u0111a ${MAX_PAYOUTS_PER_REQUEST} payout m\u1ED7i request. Chia th\xE0nh nhi\u1EC1u request.`
          }
        ]
      });
    }
    const accepted = [];
    const rejected = [];
    rawPayouts.forEach((raw2, index) => {
      const rowCollector = newCollector();
      const row = requireObject(raw2, rowCollector, `payouts[${index}]`);
      if (!row) {
        rejected.push({
          index,
          code: ErrorCode.VALIDATION_FAILED,
          message: rowCollector.errors[0]?.message ?? "D\xF2ng kh\xF4ng ph\u1EA3i object."
        });
        return;
      }
      const workerId = takeString(row, "workerId", rowCollector, { min: 3, max: 100 });
      const amountMicro = takeAmountMicro(row, "amount_micro", rowCollector);
      const reference = takeString(row, "reference", rowCollector, { required: false, max: 500 });
      if (rowCollector.hasErrors) {
        rejected.push({
          index,
          code: ErrorCode.VALIDATION_FAILED,
          message: rowCollector.errors.map((f) => f.message).join(" "),
          fields: rowCollector.errors
        });
        return;
      }
      if (workerId === null || amountMicro === null) {
        throw new AppError(ErrorCode.INTERNAL, "Validate xong m\xE0 thi\u1EBFu tr\u01B0\u1EDDng \u2014 l\u1ED7i logic.");
      }
      accepted.push({ index, workerId, amountMicro, reference: reference ?? void 0 });
    });
    const knownWorkers = await findKnownWorkers(db, platform.id, accepted.map((row) => row.workerId));
    const payable = [];
    for (const row of accepted) {
      if (knownWorkers.has(row.workerId)) {
        payable.push(row);
      } else {
        rejected.push({
          index: row.index,
          code: ErrorCode.WORKER_NOT_FOUND,
          message: "Kh\xF4ng t\xECm th\u1EA5y ng\u01B0\u1EDDi lao \u0111\u1ED9ng n\xE0y trong n\u1EC1n t\u1EA3ng."
        });
      }
    }
    payable.sort((a, b) => a.index - b.index);
    rejected.sort((a, b) => a.index - b.index);
    if (payable.length === 0) {
      throw new AppError(
        ErrorCode.VALIDATION_FAILED,
        `Kh\xF4ng c\xF3 payout n\xE0o h\u1EE3p l\u1EC7 trong ${rawPayouts.length} d\xF2ng.`,
        { rejected }
      );
    }
    const { batches: chunks, gasPerBatch } = planBatches(payable, {
      gasBudget: platform.gasBudget,
      gasPerPayout: GAS_PER_PAYOUT_ESTIMATE,
      maxBatchSize: platform.batchSize
    });
    const requestHash = hashRequest(payable);
    const plan = chunks.map((chunk, chunkIndex) => ({
      batchId: newId(ID_PREFIX.BATCH),
      estimatedGas: gasPerBatch[chunkIndex] ?? 0n,
      payouts: chunk.map((row) => ({
        id: deriveId(ID_PREFIX.PAYOUT, idempotencyKey, row.index),
        workerId: row.workerId,
        amountMicro: row.amountMicro,
        reference: row.reference,
        idempotencyKey: deriveId("idem", idempotencyKey, row.index)
      }))
    }));
    const result = await db.transaction(
      (tx) => createBatchRequest(tx, platform.id, {
        requestKey: idempotencyKey,
        requestHash,
        plan
      })
    );
    const payoutRows = result.duplicate ? await listRequestPayouts(db, platform.id, idempotencyKey) : await listBatchPayoutsForBatches(db, platform.id, result.batches.map((row) => row.id));
    const payload = {
      batches: result.batches.map(toBatchBody),
      payouts: payoutRows.map((row) => ({
        id: row.id,
        workerId: row.worker_id,
        amount_micro: row.amount_micro,
        state: row.state,
        reference: row.reference
      })),
      accepted: result.duplicate ? payoutRows.length : payable.length,
      rejected,
      duplicate: result.duplicate
    };
    if (result.duplicate) return c.json(payload, 200);
    return c.json(payload, rejected.length > 0 ? 207 : 202);
  });
  routes.post("/from-queue", async (c) => {
    const platform = c.get("platform");
    const collected = await db.transaction(async (tx) => {
      const queued = await claimQueuedPayouts(tx, platform.id, platform.batchSize * 10);
      if (queued.length === 0) return null;
      const amountsById = /* @__PURE__ */ new Map();
      for (const row of queued) amountsById.set(row.id, BigInt(row.amount_micro));
      const { batches, gasPerBatch } = planBatches(queued, {
        gasBudget: platform.gasBudget,
        gasPerPayout: GAS_PER_PAYOUT_ESTIMATE,
        maxBatchSize: platform.batchSize
      });
      const requestKey = newId(ID_PREFIX.BATCH);
      const chunks = batches.map((chunk, index) => ({
        batchId: newId(ID_PREFIX.BATCH),
        payoutIds: chunk.map((row) => row.id),
        estimatedGas: gasPerBatch[index] ?? 0n
      }));
      return createBatchesFromQueue(tx, platform.id, requestKey, chunks, amountsById);
    });
    if (!collected) {
      return c.json({ batches: [], payoutCount: 0, total_micro: "0", message: "H\xE0ng \u0111\u1EE3i r\u1ED7ng." }, 200);
    }
    return c.json(
      {
        batches: collected.batches.map(toBatchBody),
        payoutCount: collected.payoutCount,
        total_micro: collected.totalMicro
      },
      202
    );
  });
  routes.get("/:id", async (c) => {
    const platform = c.get("platform");
    const batch = await findBatchById(db, platform.id, c.req.param("id"));
    if (!batch) throw new AppError(ErrorCode.NOT_FOUND, "Kh\xF4ng t\xECm th\u1EA5y l\xF4.");
    const payouts = await listBatchPayouts(db, platform.id, batch.id);
    return c.json({
      ...toBatchBody(batch),
      payouts: payouts.map((row) => ({
        id: row.id,
        workerId: row.worker_id,
        amount_micro: row.amount_micro,
        state: row.state,
        reference: row.reference
      }))
    });
  });
  routes.get("/", async (c) => {
    const platform = c.get("platform");
    const requestKey = c.req.query("requestKey");
    if (!requestKey) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, "Thi\u1EBFu tham s\u1ED1 requestKey.", {
        fields: [{ field: "requestKey", message: "Truy\u1EC1n Idempotency-Key c\u1EE7a request c\u1EA7n tra." }]
      });
    }
    const batches = await findBatchesByRequestKey(db, platform.id, requestKey);
    return c.json({ batches: batches.map(toBatchBody) });
  });
  return routes;
}
function deriveId(prefix, key, index) {
  const digest = createHash2("sha256").update(`${key}#${index}`, "utf8").digest("hex");
  return `${prefix}_${digest.slice(0, 32)}`;
}
async function findKnownWorkers(db, platformId, ids) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return /* @__PURE__ */ new Set();
  const placeholders = unique.map((_, index) => `$${index + 2}`).join(", ");
  const result = await db.query(
    `SELECT id FROM workers WHERE platform_id = $1 AND id IN (${placeholders})`,
    [platformId, ...unique]
  );
  return new Set(result.rows.map((row) => row.id));
}
async function listBatchPayoutsForBatches(db, platformId, batchIds) {
  if (batchIds.length === 0) return [];
  const placeholders = batchIds.map((_, index) => `$${index + 2}`).join(", ");
  const result = await db.query(
    `SELECT id, worker_id, amount_micro::text AS amount_micro, state, reference
       FROM payouts
      WHERE platform_id = $1 AND batch_id IN (${placeholders})
      ORDER BY created_at ASC, id ASC`,
    [platformId, ...batchIds]
  );
  return result.rows;
}

// apps/api/src/overview.repo.ts
var toNumber = (value) => Number(value ?? "0");
async function loadOverview(db, platformId) {
  const result = await db.query(
    `SELECT
       COALESCE(SUM(amount_micro) FILTER (WHERE state = 'queued'), 0)::text    AS queued_micro,
       COUNT(*) FILTER (WHERE state = 'queued')::text                          AS queued_count,
       COALESCE(SUM(amount_micro) FILTER (WHERE state = 'batched'), 0)::text   AS batched_micro,
       COUNT(*) FILTER (WHERE state = 'batched')::text                         AS batched_count,
       COALESCE(SUM(amount_micro) FILTER (WHERE state = 'confirmed'), 0)::text AS confirmed_micro,
       COUNT(*) FILTER (WHERE state = 'confirmed')::text                       AS confirmed_count,
       COALESCE(SUM(amount_micro) FILTER (WHERE state = 'failed'), 0)::text    AS failed_micro,
       COUNT(*) FILTER (WHERE state = 'failed')::text                          AS failed_count,
       (SELECT COUNT(*)::text FROM workers WHERE platform_id = $1)             AS worker_count,
       (SELECT COUNT(*)::text FROM batches WHERE platform_id = $1)             AS batch_count
     FROM payouts WHERE platform_id = $1`,
    [platformId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("loadOverview: aggregate query kh\xF4ng tr\u1EA3 d\xF2ng n\xE0o \u2014 kh\xF4ng th\u1EC3 x\u1EA3y ra v\u1EDBi COUNT(*)");
  }
  const confirmed = toNumber(row.confirmed_count);
  const failed = toNumber(row.failed_count);
  const settled = confirmed + failed;
  return {
    queued: { count: toNumber(row.queued_count), totalMicro: row.queued_micro },
    batched: { count: toNumber(row.batched_count), totalMicro: row.batched_micro },
    confirmed: { count: confirmed, totalMicro: row.confirmed_micro },
    failed: { count: failed, totalMicro: row.failed_micro },
    workers: toNumber(row.worker_count),
    batches: toNumber(row.batch_count),
    successRate: settled === 0 ? null : confirmed / settled
  };
}
async function loadRecentBatches(db, platformId, limit) {
  const result = await db.query(
    `SELECT id, state, payout_count, total_micro::text AS total_micro, created_at, tx_hash
       FROM batches
      WHERE platform_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [platformId, limit]
  );
  return result.rows;
}

// apps/api/src/overview.route.ts
function createOverviewRoutes(options) {
  const { db } = options;
  const routes = new Hono3();
  routes.get("/", async (c) => {
    const platform = c.get("platform");
    const collector = newCollector();
    const limit = takeLimit(c.req.query("recentBatches"), collector, {
      field: "recentBatches",
      fallback: 8,
      max: 50
    });
    collector.throwIfAny();
    const [overview, batches] = await Promise.all([
      loadOverview(db, platform.id),
      loadRecentBatches(db, platform.id, limit ?? 8)
    ]);
    return c.json({
      ...overview,
      recentBatches: batches.map((batch) => ({
        id: batch.id,
        state: batch.state,
        payoutCount: batch.payout_count,
        total_micro: batch.total_micro,
        txHash: batch.tx_hash,
        created_at: batch.created_at.toISOString()
      }))
    });
  });
  return routes;
}

// apps/api/src/payouts.repo.ts
var CursorError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "CursorError";
  }
};
var SELECT_COLUMNS3 = "id, worker_id, amount_micro::text AS amount_micro, idempotency_key, reference, state, created_at";
async function upsertPayout(db, input) {
  const result = await db.query(
    `INSERT INTO payouts (id, platform_id, worker_id, amount_micro, idempotency_key, reference)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (platform_id, idempotency_key) DO UPDATE
       SET idempotency_key = EXCLUDED.idempotency_key
     RETURNING ${SELECT_COLUMNS3}, (xmax = 0) AS inserted`,
    [
      input.id,
      input.platformId,
      input.workerId,
      input.amountMicro.toString(),
      input.idempotencyKey,
      input.reference ?? null
    ]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("upsertPayout: INSERT ... RETURNING kh\xF4ng tr\u1EA3 d\xF2ng n\xE0o");
  }
  const { inserted, ...payout } = row;
  return { payout, duplicate: !inserted };
}
async function findPayoutById(db, platformId, id) {
  const result = await db.query(
    `SELECT ${SELECT_COLUMNS3} FROM payouts WHERE id = $1 AND platform_id = $2`,
    [id, platformId]
  );
  return result.rows[0] ?? null;
}
async function listPayouts(db, platformId, options) {
  const params = [platformId];
  const conditions = ["platform_id = $1"];
  if (options.workerId) {
    params.push(options.workerId);
    conditions.push(`worker_id = $${params.length}`);
  }
  if (options.cursor) {
    const decoded = decodeCursor(options.cursor);
    if (!decoded) {
      throw new CursorError("cursor kh\xF4ng h\u1EE3p l\u1EC7. D\xF9ng \u0111\xFAng gi\xE1 tr\u1ECB `nextCursor` c\u1EE7a trang tr\u01B0\u1EDBc.");
    }
    params.push(decoded.createdAt, decoded.id);
    conditions.push(`(created_at, id) < ($${params.length - 1}, $${params.length})`);
  }
  params.push(options.limit + 1);
  const result = await db.query(
    `SELECT ${SELECT_COLUMNS3} FROM payouts
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}`,
    params
  );
  const hasMore = result.rows.length > options.limit;
  const rows = hasMore ? result.rows.slice(0, options.limit) : result.rows;
  const last = rows.at(-1);
  const nextCursor = hasMore && last ? encodeCursor(last.created_at, last.id) : null;
  return { rows, nextCursor };
}
function encodeCursor(createdAt, id) {
  const iso = createdAt instanceof Date ? createdAt.toISOString() : createdAt;
  return Buffer.from(`${iso}|${id}`, "utf8").toString("base64url");
}
function decodeCursor(cursor) {
  try {
    const raw2 = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = raw2.lastIndexOf("|");
    if (separator <= 0) return null;
    const createdAt = raw2.slice(0, separator);
    const id = raw2.slice(separator + 1);
    if (!createdAt || !id) return null;
    if (Number.isNaN(Date.parse(createdAt))) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

// apps/api/src/workers.repo.ts
var SELECT_COLUMNS4 = "id, external_id, address, display_name, created_at";
async function upsertWorker(db, input) {
  const result = await db.query(
    `INSERT INTO workers (id, platform_id, external_id, address, display_name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (platform_id, external_id) DO UPDATE
       SET address      = COALESCE(EXCLUDED.address, workers.address),
           display_name = COALESCE(EXCLUDED.display_name, workers.display_name)
     RETURNING ${SELECT_COLUMNS4}, (xmax = 0) AS inserted`,
    [
      input.id,
      input.platformId,
      input.externalId,
      input.address ?? null,
      input.displayName ?? null
    ]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("upsertWorker: INSERT ... RETURNING kh\xF4ng tr\u1EA3 d\xF2ng n\xE0o");
  }
  const { inserted, ...worker } = row;
  return { worker, created: inserted };
}
async function findWorkerById(db, platformId, id) {
  const result = await db.query(
    `SELECT ${SELECT_COLUMNS4} FROM workers WHERE id = $1 AND platform_id = $2`,
    [id, platformId]
  );
  return result.rows[0] ?? null;
}
async function findWorkerByExternalId(db, platformId, externalId) {
  const result = await db.query(
    `SELECT ${SELECT_COLUMNS4} FROM workers WHERE platform_id = $1 AND external_id = $2`,
    [platformId, externalId]
  );
  return result.rows[0] ?? null;
}
async function listWorkers(db, platformId, limit) {
  const result = await db.query(
    `SELECT ${SELECT_COLUMNS4} FROM workers
      WHERE platform_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [platformId, limit]
  );
  return result.rows;
}

// apps/api/src/payouts.route.ts
function toPayoutBody(row) {
  return {
    id: row.id,
    workerId: row.worker_id,
    amount_micro: row.amount_micro,
    state: row.state,
    reference: row.reference,
    created_at: row.created_at.toISOString()
  };
}
function createPayoutRoutes(options) {
  const { db } = options;
  const routes = new Hono3();
  routes.post("/", async (c) => {
    const platform = c.get("platform");
    const idempotencyKey = requireIdempotencyKey(c.req.header("idempotency-key"));
    const body = await readJsonBody(c.req);
    const collector = newCollector();
    const source = requireObject(body, collector);
    if (!source) {
      collector.throwIfAny();
      throw new AppError(ErrorCode.INTERNAL, "Body kh\xF4ng ph\u1EA3i object nh\u01B0ng kh\xF4ng c\xF3 l\u1ED7i \u2014 l\u1ED7i logic.");
    }
    const workerId = takeString(source, "workerId", collector, { min: 3, max: 100 });
    const amountMicro = takeAmountMicro(source, "amount_micro", collector);
    const reference = takeString(source, "reference", collector, { required: false, max: 500 });
    collector.throwIfAny();
    if (workerId === null || amountMicro === null) {
      throw new AppError(ErrorCode.INTERNAL, "Validate xong m\xE0 thi\u1EBFu tr\u01B0\u1EDDng b\u1EAFt bu\u1ED9c \u2014 l\u1ED7i logic.");
    }
    const worker = await findWorkerById(db, platform.id, workerId);
    if (!worker) {
      throw new AppError(ErrorCode.WORKER_NOT_FOUND, "Kh\xF4ng t\xECm th\u1EA5y ng\u01B0\u1EDDi lao \u0111\u1ED9ng n\xE0y trong n\u1EC1n t\u1EA3ng.");
    }
    const { payout, duplicate } = await upsertPayout(db, {
      id: newId(ID_PREFIX.PAYOUT),
      platformId: platform.id,
      workerId,
      amountMicro,
      idempotencyKey,
      reference: reference ?? void 0
    });
    return c.json({ ...toPayoutBody(payout), duplicate }, duplicate ? 200 : 202);
  });
  routes.get("/", async (c) => {
    const platform = c.get("platform");
    const collector = newCollector();
    const limit = takeLimit(c.req.query("limit"), collector, { fallback: 50, max: 200 });
    const workerId = takeString(
      { workerId: c.req.query("workerId") },
      "workerId",
      collector,
      { required: false, max: 100 }
    );
    collector.throwIfAny();
    const page = await listPayouts(db, platform.id, {
      workerId: workerId ?? void 0,
      limit: limit ?? 50,
      cursor: c.req.query("cursor")
    });
    return c.json({
      payouts: page.rows.map(toPayoutBody),
      nextCursor: page.nextCursor
    });
  });
  routes.get("/:id", async (c) => {
    const platform = c.get("platform");
    const payout = await findPayoutById(db, platform.id, c.req.param("id"));
    if (!payout) throw new AppError(ErrorCode.NOT_FOUND, "Kh\xF4ng t\xECm th\u1EA5y payout.");
    return c.json(toPayoutBody(payout));
  });
  return routes;
}

// apps/api/src/workers.route.ts
function toWorkerBody(row) {
  return {
    id: row.id,
    externalId: row.external_id,
    address: row.address,
    displayName: row.display_name,
    created_at: row.created_at.toISOString()
  };
}
function createWorkerRoutes(options) {
  const { db } = options;
  const routes = new Hono3();
  routes.post("/", async (c) => {
    const platform = c.get("platform");
    const body = await readJsonBody(c.req);
    const collector = newCollector();
    const source = requireObject(body, collector);
    if (!source) {
      collector.throwIfAny();
      throw new AppError(ErrorCode.INTERNAL, "Body kh\xF4ng ph\u1EA3i object nh\u01B0ng kh\xF4ng c\xF3 l\u1ED7i \u2014 l\u1ED7i logic.");
    }
    const externalId = takeString(source, "externalId", collector, { min: 1, max: 200 });
    const address = takeAddress(source, "address", collector, { required: false });
    const displayName = takeString(source, "displayName", collector, { required: false, max: 200 });
    collector.throwIfAny();
    if (externalId === null) {
      throw new AppError(ErrorCode.INTERNAL, "Thi\u1EBFu externalId sau khi validate \u2014 l\u1ED7i logic.");
    }
    const { worker, created } = await upsertWorker(db, {
      id: newId(ID_PREFIX.WORKER),
      platformId: platform.id,
      externalId,
      address,
      displayName: displayName ?? void 0
    });
    return c.json({ ...toWorkerBody(worker), created }, created ? 201 : 200);
  });
  routes.get("/", async (c) => {
    const platform = c.get("platform");
    const collector = newCollector();
    const limit = takeLimit(c.req.query("limit"), collector, { fallback: 100, max: 500 });
    collector.throwIfAny();
    const workers = await listWorkers(db, platform.id, limit ?? 100);
    return c.json({ workers: workers.map(toWorkerBody) });
  });
  routes.get("/:id", async (c) => {
    const platform = c.get("platform");
    const externalId = c.req.query("externalId");
    if (externalId) {
      const worker2 = await findWorkerByExternalId(db, platform.id, externalId);
      if (!worker2) throw new AppError(ErrorCode.WORKER_NOT_FOUND, "Kh\xF4ng t\xECm th\u1EA5y ng\u01B0\u1EDDi lao \u0111\u1ED9ng.");
      return c.json(toWorkerBody(worker2));
    }
    const worker = await db.query(
      `SELECT id, external_id, address, display_name, created_at
         FROM workers WHERE id = $1 AND platform_id = $2`,
      [c.req.param("id"), platform.id]
    );
    const row = worker.rows[0];
    if (!row) throw new AppError(ErrorCode.WORKER_NOT_FOUND, "Kh\xF4ng t\xECm th\u1EA5y ng\u01B0\u1EDDi lao \u0111\u1ED9ng.");
    return c.json(toWorkerBody(row));
  });
  return routes;
}

// apps/api/src/app.ts
var defaultRequestId = () => `req_${crypto.randomUUID()}`;
function createApp(options) {
  const { db } = options;
  const newRequestId = options.generateRequestId ?? defaultRequestId;
  const app = new Hono3();
  app.use("*", async (c, next) => {
    const requestId = newRequestId();
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    await next();
  });
  app.onError((error, c) => {
    const appError = toAppError(error);
    const requestId = c.get("requestId") ?? "req_unknown";
    if (appError.status >= 500) {
      process.stderr.write(
        `${JSON.stringify({
          level: "error",
          requestId,
          code: appError.code,
          path: c.req.path,
          error: error instanceof Error ? error.message : String(error)
        })}
`
      );
    }
    return c.json(appError.toBody(requestId), appError.status);
  });
  app.notFound((c) => {
    const requestId = c.get("requestId") ?? "req_unknown";
    return c.json(new AppError(ErrorCode.NOT_FOUND, "Endpoint kh\xF4ng t\u1ED3n t\u1EA1i.").toBody(requestId), 404);
  });
  app.get("/health", async (c) => {
    let dbOk = true;
    try {
      await db.query("SELECT 1");
    } catch {
      dbOk = false;
    }
    return c.json(
      { status: dbOk ? "ok" : "degraded", db: dbOk ? "ok" : "down", time: (/* @__PURE__ */ new Date()).toISOString() },
      dbOk ? 200 : 503
    );
  });
  app.use("/v1/*", async (c, next) => {
    const platform = await authenticate(db, c.req.header("authorization") ?? null);
    c.set("platform", platform);
    await next();
  });
  app.get("/v1/me", (c) => {
    const platform = c.get("platform");
    return c.json({
      id: platform.id,
      name: platform.name,
      batchSize: platform.batchSize,
      batchIntervalMs: platform.batchIntervalMs,
      gasBudget: platform.gasBudget.toString(),
      // Số payout tối đa mỗi lô với ngân sách gas hiện tại — client cần biết để
      // không phải đoán tại sao 400 payout thành 2 lô.
      maxPayoutsPerBatch: Number(platform.gasBudget / GAS_PER_PAYOUT_ESTIMATE)
    });
  });
  app.route("/v1/payouts", createPayoutRoutes({ db }));
  app.route("/v1/batches", createBatchRoutes({ db }));
  app.route("/v1/workers", createWorkerRoutes({ db }));
  app.route("/v1/overview", createOverviewRoutes({ db }));
  if (options.webRoot) {
    app.use("/*", serveStatic({ root: options.webRoot }));
  }
  return app;
}

// packages/db/src/migrate.ts
import { readdir, readFile } from "node:fs/promises";
import { existsSync as existsSync2 } from "node:fs";
import path from "node:path";
import process2 from "node:process";
import { fileURLToPath } from "node:url";
var DEFAULT_MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
var MIGRATION_PATTERN = /^(\d{3,})_([a-z0-9_]+)\.sql$/;
var EMBEDDED_MIGRATIONS = Object.freeze({
  "001_init.sql": `
CREATE TABLE IF NOT EXISTS platforms (
  id                TEXT        PRIMARY KEY,
  name              TEXT        NOT NULL,
  api_key_hash      TEXT        NOT NULL UNIQUE,
  signing_mode      TEXT        NOT NULL DEFAULT 'eoa'
                                CHECK (signing_mode IN ('eoa', 'vault', 'eip3009')),
  address           TEXT,
  webhook_url       TEXT,
  webhook_secret    TEXT,
  batch_size        INTEGER     NOT NULL DEFAULT 200 CHECK (batch_size BETWEEN 1 AND 500),
  batch_interval_ms INTEGER     NOT NULL DEFAULT 2000 CHECK (batch_interval_ms BETWEEN 100 AND 60000),
  gas_budget        BIGINT      NOT NULL DEFAULT 10000000,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workers (
  id           TEXT        PRIMARY KEY,
  platform_id  TEXT        NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  external_id  TEXT        NOT NULL,
  address      TEXT        CHECK (address IS NULL OR address = lower(address)),
  display_name TEXT,
  claim_token  TEXT        UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform_id, external_id)
);

CREATE TABLE IF NOT EXISTS batches (
  id            TEXT        PRIMARY KEY,
  platform_id   TEXT        NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  state         TEXT        NOT NULL DEFAULT 'planned'
                            CHECK (state IN ('planned', 'submitting', 'confirmed', 'partial', 'failed', 'unknown')),
  payout_count  INTEGER     NOT NULL CHECK (payout_count > 0),
  total_micro   BIGINT      NOT NULL CHECK (total_micro > 0),
  estimated_gas BIGINT      NOT NULL,
  tx_hash       TEXT        UNIQUE,
  block_number  BIGINT,
  gas_used      BIGINT,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS batches_by_platform ON batches (platform_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payouts (
  id              TEXT        PRIMARY KEY,
  platform_id     TEXT        NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  worker_id       TEXT        NOT NULL REFERENCES workers(id),
  batch_id        TEXT        REFERENCES batches(id) ON DELETE SET NULL,
  amount_micro    BIGINT      NOT NULL CHECK (amount_micro > 0),
  idempotency_key TEXT        NOT NULL,
  reference       TEXT,
  state           TEXT        NOT NULL DEFAULT 'queued'
                              CHECK (state IN ('queued', 'batched', 'submitted', 'confirmed', 'failed', 'unknown')),
  failure_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at    TIMESTAMPTZ,
  CONSTRAINT payouts_idempotency_unique UNIQUE (platform_id, idempotency_key),
  CONSTRAINT payout_batch_consistency CHECK (
    (state = 'queued' AND batch_id IS NULL) OR
    (state <> 'queued' AND batch_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS payouts_queued ON payouts (platform_id, created_at)
  WHERE state = 'queued';

CREATE INDEX IF NOT EXISTS payouts_by_worker ON payouts (worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payouts_by_batch ON payouts (batch_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL   PRIMARY KEY,
  actor      TEXT        NOT NULL,
  action     TEXT        NOT NULL,
  target     TEXT        NOT NULL,
  detail     JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_by_target ON audit_log (target, created_at DESC);
`,
  "002_batch_idempotency.sql": `
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE batches
  ALTER COLUMN idempotency_key SET NOT NULL;

ALTER TABLE batches
  DROP CONSTRAINT IF EXISTS batches_idempotency_unique;

ALTER TABLE batches
  ADD CONSTRAINT batches_idempotency_unique UNIQUE (platform_id, idempotency_key);
`,
  "003_batch_request_key.sql": `
ALTER TABLE batches ADD COLUMN IF NOT EXISTS request_key TEXT;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS request_hash TEXT;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS chunk_index INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS batches_request_chunk_unique
  ON batches (platform_id, request_key, chunk_index)
  WHERE request_key IS NOT NULL;
`
});
function resolveMigrationsDir(explicitDir) {
  if (explicitDir) {
    if (!existsSync2(explicitDir)) throw new Error(`kh\xF4ng t\xECm th\u1EA5y th\u01B0 m\u1EE5c migration: ${explicitDir}`);
    return explicitDir;
  }
  if (existsSync2(DEFAULT_MIGRATIONS_DIR)) return DEFAULT_MIGRATIONS_DIR;
  const cwdDir = path.resolve(process2.cwd(), "packages", "db", "migrations");
  if (existsSync2(cwdDir)) return cwdDir;
  return null;
}
async function migrate(db, options = {}) {
  const resolvedDir = resolveMigrationsDir(options.dir);
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  let migrationEntries;
  if (resolvedDir) {
    const files = (await readdir(resolvedDir)).filter((name) => MIGRATION_PATTERN.test(name)).sort();
    if (files.length === 0) return { applied: [], skipped: [] };
    const allSql = (await readdir(resolvedDir)).filter((name) => name.endsWith(".sql"));
    const malformed = allSql.filter((name) => !MIGRATION_PATTERN.test(name));
    if (malformed.length) {
      throw new Error(
        `t\xEAn migration kh\xF4ng h\u1EE3p l\u1EC7: ${malformed.join(", ")} \u2014 ph\u1EA3i l\xE0 NNN_ten_file.sql`
      );
    }
    migrationEntries = files.map((file) => ({
      name: file,
      getSql: () => readFile(path.join(resolvedDir, file), "utf8")
    }));
  } else {
    migrationEntries = Object.keys(EMBEDDED_MIGRATIONS).sort().map((name) => ({
      name,
      getSql: async () => EMBEDDED_MIGRATIONS[name]
    }));
  }
  const done = await db.query("SELECT version FROM schema_migrations");
  const appliedSet = new Set(done.rows.map((row) => row.version));
  const applied = [];
  const skipped = [];
  for (const entry of migrationEntries) {
    if (appliedSet.has(entry.name)) {
      skipped.push(entry.name);
      continue;
    }
    const sql = await entry.getSql();
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations (version) VALUES ($1)", [entry.name]);
    });
    applied.push(entry.name);
  }
  return { applied, skipped };
}
if (process2.argv[1] && path.resolve(process2.argv[1]) === fileURLToPath(import.meta.url)) {
  const { PgliteDatabase: PgliteDatabase2 } = await Promise.resolve().then(() => (init_pglite(), pglite_exports));
  const db = await PgliteDatabase2.create({ dataDir: process2.env.DATABASE_DIR || "memory://" });
  const result = await migrate(db);
  process2.stdout.write(`migrate: ${result.applied.length} applied, ${result.skipped.length} skipped
`);
  for (const file of result.applied) process2.stdout.write(`  + ${file}
`);
  await db.close();
}

// apps/api/src/vercel.ts
init_pglite();

// packages/db/src/seed.ts
var DEFAULT_PLATFORM_ID = "plat_demo";
var DEFAULT_SEED_KEY = "nhip_sk_seed_00000000000000000000000000000001";
var WORKERS = [
  { externalId: "driver-001", name: "Nguy\u1EC5n V\u0103n An", address: "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed" },
  { externalId: "driver-002", name: "Tr\u1EA7n Th\u1ECB B\xECnh", address: "0x1234567890abcdef1234567890abcdef12345678" },
  { externalId: "driver-003", name: "L\xEA Minh C\u01B0\u1EDDng", address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" },
  { externalId: "driver-004", name: "Ph\u1EA1m Thu Dung", address: "0x9876543210fedcba9876543210fedcba98765432" },
  { externalId: "driver-005", name: "Ho\xE0ng Gia H\xE2n", address: null }
];
async function seedDemo(db, apiKey = DEFAULT_SEED_KEY) {
  await db.query(
    `INSERT INTO platforms (id, name, api_key_hash, address, batch_size, batch_interval_ms, gas_budget)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           api_key_hash = EXCLUDED.api_key_hash,
           address = EXCLUDED.address`,
    [
      DEFAULT_PLATFORM_ID,
      "Giao H\xE0ng Nhanh (demo)",
      hashApiKey(apiKey),
      "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed",
      200,
      2e3,
      "10000000"
    ]
  );
  const workerIds = [];
  for (const worker of WORKERS) {
    const { worker: row } = await upsertWorker(db, {
      id: newId(ID_PREFIX.WORKER),
      platformId: DEFAULT_PLATFORM_ID,
      externalId: worker.externalId,
      address: worker.address,
      displayName: worker.name
    });
    workerIds.push(row.id);
  }
  const PAID_KEYS = Array.from({ length: 40 }, (_, index) => `seed-paid-${String(index).padStart(3, "0")}`);
  const QUEUED_KEYS = Array.from({ length: 12 }, (_, index) => `seed-queued-${String(index).padStart(3, "0")}`);
  for (let index = 0; index < PAID_KEYS.length; index++) {
    const workerId = workerIds[index % workerIds.length];
    if (!workerId) continue;
    const amount = micro(BigInt(45e3 + index * 7500 % 18e4) * 1000n);
    await upsertPayout(db, {
      id: newId(ID_PREFIX.PAYOUT),
      platformId: DEFAULT_PLATFORM_ID,
      workerId,
      amountMicro: amount,
      idempotencyKey: PAID_KEYS[index] ?? `seed-paid-${index}`,
      reference: `\u0110\u01A1n #${20260 + index}`
    });
  }
  for (let index = 0; index < QUEUED_KEYS.length; index++) {
    const workerId = workerIds[(index + 2) % workerIds.length];
    if (!workerId) continue;
    const amount = micro(BigInt(35e3 + index * 12e3 % 12e4) * 1000n);
    await upsertPayout(db, {
      id: newId(ID_PREFIX.PAYOUT),
      platformId: DEFAULT_PLATFORM_ID,
      workerId,
      amountMicro: amount,
      idempotencyKey: QUEUED_KEYS[index] ?? `seed-queued-${index}`,
      reference: `\u0110\u01A1n ch\u1EDD #${20400 + index}`
    });
  }
  const paidPayouts = await db.query(
    `SELECT id FROM payouts
      WHERE platform_id = $1 AND idempotency_key = ANY($2::text[])
      ORDER BY id`,
    [DEFAULT_PLATFORM_ID, PAID_KEYS]
  );
  if (paidPayouts.rows.length > 0) {
    const existingHistory = await db.query(
      `SELECT id FROM batches
        WHERE platform_id = $1 AND idempotency_key = 'batch:seed-history'
        LIMIT 1`,
      [DEFAULT_PLATFORM_ID]
    );
    const batchId = existingHistory.rows[0]?.id ?? "bat_seed_history";
    const ids = paidPayouts.rows.map((row) => row.id);
    const totals = await db.query(
      `SELECT COALESCE(SUM(amount_micro), 0)::text AS total FROM payouts WHERE id = ANY($1::text[])`,
      [ids]
    );
    const total = totals.rows[0]?.total ?? "0";
    await db.query(
      `INSERT INTO batches (id, platform_id, state, payout_count, total_micro, estimated_gas, idempotency_key, tx_hash)
       VALUES ($1, $2, 'confirmed', $3, $4, $5, 'batch:seed-history', $6)
       ON CONFLICT (id) DO UPDATE
         SET payout_count = EXCLUDED.payout_count,
             total_micro = EXCLUDED.total_micro`,
      [
        batchId,
        DEFAULT_PLATFORM_ID,
        paidPayouts.rows.length,
        total,
        28e3 * paidPayouts.rows.length,
        "0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b"
      ]
    );
    const placeholders = ids.map((_, i) => `$${i + 3}`).join(", ");
    await db.query(
      `UPDATE payouts
          SET batch_id = $1, state = 'confirmed'
        WHERE platform_id = $2 AND id IN (${placeholders})`,
      [batchId, DEFAULT_PLATFORM_ID, ...ids]
    );
  }
  return { platformId: DEFAULT_PLATFORM_ID, apiKey };
}

// apps/api/src/vercel.ts
var appPromise = null;
async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const dataDir = process.env.DATABASE_DIR ?? (process.env.VERCEL ? "/tmp/nhip" : "./.data/nhip");
      const db = await PgliteDatabase.create({ dataDir });
      await migrate(db);
      await seedDemo(db);
      return createApp({ db });
    })();
  }
  return appPromise;
}
async function handler(req, res) {
  const app = await getApp();
  if (res && typeof res.status === "function") {
    const listener = getRequestListener(app.fetch);
    return listener(req, res);
  }
  return app.fetch(req);
}
export {
  handler as default
};
/*! Bundled license information:

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
