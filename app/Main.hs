{-# language OverloadedStrings #-}

module Main where

import Database.PostgreSQL.Simple (connectPostgreSQL)
import Network.Wai.Handler.Warp (run)

import Humblr (humblr)

main :: IO ()
main = do
    conn <- connectPostgreSQL "host='/tmp' dbname='humblrdb'"
    run 8080 $ humblr conn
