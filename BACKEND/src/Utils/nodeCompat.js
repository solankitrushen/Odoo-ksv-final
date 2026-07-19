// Node >=22 removed the long-deprecated buffer.SlowBuffer alias. jsonwebtoken's
// transitive dep `buffer-equal-constant-time` still reads SlowBuffer.prototype at
// load time and crashes without it. Restore the alias (identical semantics to
// Buffer) before any jsonwebtoken import. Safe no-op on older Node.
import buffer from "buffer";

if (typeof buffer.SlowBuffer === "undefined") {
  buffer.SlowBuffer = buffer.Buffer;
}

export default true;
