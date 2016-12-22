module Humblr.Util where

import           Crypto.KDF.Scrypt
import           Data.ByteString    (ByteString)
import           Data.Serialize     (Serialize)
import qualified Data.Serialize     as B
import           Data.Text          (Text)
import           Data.Text.Encoding (encodeUtf8)
import           Web.ClientSession

genHash :: Text -> ByteString -> ByteString
genHash password = generate (Parameters (2^14) 8 1 100) (encodeUtf8 password)

eitherToMaybe :: Either e a -> Maybe a
eitherToMaybe (Left _) = Nothing
eitherToMaybe (Right a) = Just a

decodeCookie :: Serialize a => Key -> Text -> Maybe a
decodeCookie key cookie = decrypt key (encodeUtf8 cookie) >>= eitherToMaybe . B.decode
