{-# LANGUAGE Arrows            #-}
{-# LANGUAGE OverloadedStrings #-}

module Humblr.Endpoints.Register where

import           Control.Arrow
import           Control.Lens
import           Control.Monad.IO.Class
import           Data.Check.Field
import qualified Data.List.NonEmpty         as N
import qualified Data.Map                   as M
import qualified Data.Text                  as T
import qualified Data.Text.Lazy             as L
import           Database.PostgreSQL.Simple (Connection)
import           Lucid
import           System.Entropy
import           Web.ClientSession          (Key)
import           Web.FormUrlEncoded
import           Web.Scotty

import           Humblr.Database.Models
import           Humblr.Database.Queries
import           Humblr.Html
import           Humblr.Util                (genHash)

data RegisterUser
  = RegisterUser
  { registerUsername        :: T.Text
  , registerEmail           :: T.Text
  , registerConfirmEmail    :: T.Text
  , registerPassword        :: T.Text
  , registerConfirmPassword :: T.Text
  }

instance FromForm RegisterUser where
  fromForm form
    = RegisterUser <$>
      parseUnique "username" form <*>
      parseUnique "email" form <*>
      parseUnique "confirm-email" form <*>
      parseUnique "password" form <*>
      parseUnique "confirm-password" form

data RegistrationError
  = EmailExists
  | UsernameExists
  | PasswordTooShort
  | PasswordsDoNotMatch
  | EmailsDoNotMatch
  deriving (Eq, Show)

showRegistrationError :: RegistrationError -> T.Text
showRegistrationError EmailExists = "That email is already taken"
showRegistrationError UsernameExists = "That username is already taken"
showRegistrationError PasswordTooShort = "Your password is too short"

register :: Key -> Connection -> ScottyM ()
register key conn = do
  get "/register" . html . renderText $ registerPage M.empty
  post "/register" $ do
    payload <- body
    let registerUser = fromForm =<< urlDecodeForm payload
    case registerUser of
      Left err -> raise $ L.fromStrict err
      Right user -> do
        user <- liftIO $ checkT validateRegistration user
        case user of
          Left errs -> html . renderText . registerPage . fmap (showRegistrationError . N.head) $ getFieldErrors errs
          Right user -> do
            salt <- liftIO $ getEntropy 100
            liftIO $ insertUser conn
              (registerUsername user)
              (registerEmail user)
              (genHash (registerPassword user) salt)
              salt
            html $ renderText successPage
  where
    validateRegistration :: CheckFieldT IO RegistrationError RegisterUser RegisterUser
    validateRegistration = proc user -> do
      expectM "username" (fmap not . usernameExists conn) UsernameExists -< registerUsername user
      expectM "email" (fmap not . emailExists conn) EmailExists -< registerEmail user
      expect "password" ((>= 8) . T.length) PasswordTooShort -< registerPassword user
      whenFalse "confirm-password" PasswordsDoNotMatch -< registerPassword user == registerConfirmPassword user
      whenFalse "confirm-email" EmailsDoNotMatch -< registerEmail user == registerConfirmEmail user
      returnA -< user

registerPage :: M.Map T.Text T.Text -> Html ()
registerPage errs = page (PageConfig "Register" body)
  where
    body = do
      h1_ "Sign me up"
      with form_ [method_ "post", action_ "/register"] $ do
        with label_ [for_ "username"] "Username: "
        input_ [type_ "text", name_ "username", id_ "username"]
        maybe "" (with span_ [class_ "error"] . toHtml) $ M.lookup "username" errs
        br_ []

        with label_ [for_ "email"] "Email: "
        input_ [type_ "text", name_ "email", id_ "email"]
        maybe "" (with span_ [class_ "error"] . toHtml) $ M.lookup "email" errs
        br_ []

        with label_ [for_ "confirm-email"] "Confirm Email: "
        input_ [type_ "text", name_ "confirm-email", id_ "confirm-email"]
        maybe "" (with span_ [class_ "error"] . toHtml) $ M.lookup "confirm-email" errs
        br_ []

        with label_ [for_ "password"] "Password: "
        input_ [type_ "password", name_ "password", id_ "password"]
        maybe "" (with span_ [class_ "error"] . toHtml) $ M.lookup "password" errs
        br_ []

        with label_ [for_ "confirm-password"] "Confirm Password: "
        input_ [type_ "password", name_ "confirm-password", id_ "confirm-password"]
        maybe "" (with span_ [class_ "error"] . toHtml) $ M.lookup "confirm-password" errs
        br_ []
        br_ []

        input_ [type_ "submit", value_ "Register"]

successPage :: Html ()
successPage = page (PageConfig "Register" body)
  where
    body = do
      h1_ "Success!"
      p_ $ do
        "Log in "
        with a_ [href_ "/login"] "here"
