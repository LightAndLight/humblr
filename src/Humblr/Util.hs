module Humblr.Util where

import           Crypto.KDF.Scrypt
import           Data.ByteString    (ByteString)
import           Data.Text          (Text)
import           Data.Text.Encoding (encodeUtf8)

genHash :: Text -> ByteString -> ByteString
genHash password = generate (Parameters (2^14) 8 1 100) (encodeUtf8 password)
