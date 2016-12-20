{-# LANGUAGE OverloadedStrings #-}

module Main where

import           Database.PostgreSQL.Simple  (connectPostgreSQL)
import           Network.Wai.Handler.Warp    (defaultSettings)
import           Network.Wai.Handler.WarpTLS (runTLS, tlsSettings)
import           Web.ClientSession

import           Humblr                      (humblr)

main :: IO ()
main = do
    conn <- connectPostgreSQL "host='/tmp' dbname='humblrdb'"
    (_,key) <- randomKey
    app <- humblr key conn
    runTLS (tlsSettings ".tls/certificate.pem" ".tls/key.pem") defaultSettings app
