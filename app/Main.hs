{-# language OverloadedStrings #-}

module Main where

import Database.PostgreSQL.Simple (connectPostgreSQL)
import Network.Wai.Handler.WarpTLS (runTLS, tlsSettings)
import Network.Wai.Handler.Warp (defaultSettings)
import Web.ClientSession

import Humblr (humblr)

main :: IO ()
main = do
    conn <- connectPostgreSQL "host='/tmp' dbname='humblrdb'"
    (_,key) <- randomKey
    runTLS (tlsSettings ".tls/certificate.pem" ".tls/key.pem") defaultSettings $ humblr key conn
