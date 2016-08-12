module Main where

import Network.Wai.Handler.Warp (run)

import Humblr (humblr)

main :: IO ()
main = run 8080 humblr
