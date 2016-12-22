#!/usr/bin/env stack
{-
stack
--resolver lts-7.14
--install-ghc runghc
--package clay
--package text
-}

{-# LANGUAGE OverloadedStrings #-}

import           Clay
import           Clay.Selector
import           Data.Monoid
import qualified Data.Text.Lazy.IO as L (writeFile)

phi = 1.618033988749895

bodyWidth = 100 / phi
leftMargin = (100 - bodyWidth) / phi
rightMargin = 100 - (bodyWidth + leftMargin)

stylesheet :: Css
stylesheet = do
  html ? do
    fontFamily ["Assistant"] [sansSerif]
    color $ rgb 40 40 40
    borderLeft solid (px 15.0) $ rgb 238 238 238
    borderTop solid (px 3.0) $ rgb 238 238 238
  section # "#posts" <> form # "#login" ? do
    width $ pct (100 / phi)
    marginLeft $ pct leftMargin
  h1 ? do
    fontSize $ em 5.0
    marginLeft $ pct rightMargin
  section # ".post" ? do
    borderBottom solid (px 1.0) $ rgb 238 238 238
    paddingBottom $ em (1 / phi)
  input ? do
    border solid (px 1.0) $ rgb 210 210 210
    borderRadius (em 0.1) (em 0.1) (em 0.1) (em 0.1)
    fontFamily ["Assistant"] [sansSerif]
    fontWeight $ weight 300
    fontSize $ em 3.0
    padding (em 0.25) (em 0.25) (em 0.25) (em 0.25)
    textAlign center
    width $ pct (bodyWidth + rightMargin / phi)
    ("type" @= "submit") & do
      fontSize $ em 2.25
      paddingLeft (em 1.0)
      paddingRight (em 1.0)
      backgroundColor $ rgb 238 238 238
      hover & backgroundColor (rgb 220 220 220)
      width $ pct (bodyWidth - leftMargin)
  input # focus <> input # hover ? borderColor (rgb 170 170 170)

main = L.writeFile "style.css" $ render stylesheet
