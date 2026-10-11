-- A shop is created on its first push. The relay knows only a random id and the
-- SHA-256 of a write token; both are derived on the phone from the sync code.
CREATE TABLE IF NOT EXISTS shops (
  id          char(32)    PRIMARY KEY CHECK (id ~ '^[0-9a-f]{32}$'),
  token_hash  bytea       NOT NULL CHECK (octet_length(token_hash) = 32),
  op_count    integer     NOT NULL DEFAULT 0 CHECK (op_count >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now()
);

-- Encrypted operations. (dev, seq) is the plaintext routing key; ct is AES-GCM
-- ciphertext bound to that key. Re-sending the same op is a no-op.
CREATE TABLE IF NOT EXISTS ops (
  shop_id     char(32)    NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  dev         varchar(16) NOT NULL CHECK (dev ~ '^[a-z0-9]{4,16}$'),
  seq         integer     NOT NULL CHECK (seq > 0),
  ct          text        NOT NULL CHECK (char_length(ct) <= 8192),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, dev, seq)
);
