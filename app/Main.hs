{-# LANGUAGE OverloadedStrings #-}

module Main where

import           Database.PostgreSQL.Simple  (connectPostgreSQL)
import           Network.Wai.Handler.Warp    (defaultSettings)
import           Network.Wai.Handler.WarpTLS (runTLS, tlsSettings)
import           Web.ClientSession
import           Web.Scotty.TLS

import           Humblr                      (humblr)

main :: IO ()
main = do
  conn <- connectPostgreSQL "host='/tmp' dbname='humblrdb'"
  (_,key) <- randomKey
  scottyTLS 3000 ".tls/key.pem" ".tls/certificate.pem" $ humblr key conn
