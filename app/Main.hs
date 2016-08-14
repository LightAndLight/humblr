{-# language OverloadedStrings #-}

module Main where

import Database.PostgreSQL.Simple (connectPostgreSQL)
import Network.Wai.Handler.WarpTLS (runTLS, tlsSettings)
import Network.Wai.Handler.Warp (defaultSettings)

import Humblr (humblr)

main :: IO ()
main = do
    conn <- connectPostgreSQL "host='/tmp' dbname='humblrdb'"
    runTLS (tlsSettings ".tls/certificate.pem" ".tls/key.pem") defaultSettings $ humblr conn
