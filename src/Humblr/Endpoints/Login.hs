{-# LANGUAGE Arrows            #-}
{-# LANGUAGE OverloadedStrings #-}

module Humblr.Endpoints.Login where

import           Control.Arrow
import           Control.Lens
import           Control.Monad.IO.Class
import           Data.ByteString            (ByteString)
import           Data.Check.Field
import qualified Data.List.NonEmpty         as N
import           Data.Map                   (Map)
import qualified Data.Map                   as M
import           Data.Maybe
import qualified Data.Serialize             as B
import qualified Data.Text                  as T
import           Data.Text.Encoding         (decodeUtf8, encodeUtf8)
import qualified Data.Text.Lazy             as L
import           Database.PostgreSQL.Simple (Connection)
import           Lucid
import           Network.HTTP.Types.Status
import           Web.ClientSession
import           Web.FormUrlEncoded
import           Web.Scotty
import           Web.Scotty.Cookie

import           Humblr.Database.Models
import           Humblr.Database.Queries
import           Humblr.Endpoints.Home
import           Humblr.Html
import           Humblr.Util                (genHash)

type User = User' Int T.Text T.Text ByteString ByteString

data LoginUser = LoginUser { loginUsername :: T.Text, loginPassword :: T.Text }
instance FromForm LoginUser where
  fromForm form
    = LoginUser <$>
      parseUnique "username" form <*>
      parseUnique "password" form

data LoginError
  = UserDoesNotExist
  | PasswordIncorrect

showLoginError :: LoginError -> T.Text
showLoginError UserDoesNotExist = "Incorrect username"
showLoginError PasswordIncorrect = "Incorrect password"

passwordMatches password user
  = genHash password (user ^. userSalt) == (user ^. userPassword)

login :: Key -> Connection -> ScottyM ()
login key conn = do
  get "/login" . html . renderText $ loginPage M.empty
  post "/login" $ do
    payload <- body
    case urlDecodeForm payload >>= fromForm of
      Left err -> raise $ L.fromStrict err
      Right loginUser -> do
        res <- liftIO $ checkT validateLogin loginUser
        case res of
          Right user -> do
            t <- liftIO . encryptIO key $
              B.encode $ DisplayUser (user ^. userId) (user ^. userName)
            status status303
            setHeader "Location" "/"
            setSimpleCookie "auth" $ decodeUtf8 t
          Left errs -> html . renderText . loginPage $ fmap (showLoginError . N.head) (getFieldErrors errs)
  where
    validateLogin :: CheckFieldT IO LoginError LoginUser User
    validateLogin = proc loginUser -> do
      maybeUser <- liftEffect (selectUserByUsername conn) -< loginUsername loginUser
      expect "username" isJust UserDoesNotExist -< maybeUser
      case maybeUser of
        Just user -> do
          whenFalse "password" PasswordIncorrect -< passwordMatches (loginPassword loginUser) user
          returnA -< user
        Nothing -> failure -< ()

loginPage :: Map T.Text T.Text -> Html ()
loginPage errs = page $ PageConfig "Login" header body []
  where
    header = h1_ "Log In"
    body = loginForm errs
