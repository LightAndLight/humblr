{-# LANGUAGE Arrows                     #-}
{-# LANGUAGE DataKinds                  #-}
{-# LANGUAGE DeriveGeneric              #-}
{-# LANGUAGE GeneralizedNewtypeDeriving #-}
{-# LANGUAGE OverloadedStrings          #-}
{-# LANGUAGE TypeFamilies               #-}
{-# LANGUAGE TypeOperators              #-}

module Humblr (humblr) where

import           Control.Arrow
import           Control.Lens               hiding ((.=))
import           Control.Monad.Except
import           Control.Monad.IO.Class     (liftIO)
import           Control.Monad.Reader
import           Crypto.KDF.Scrypt
import           Data.Aeson                 (FromJSON (..), ToJSON (..),
                                             Value (..), object, (.:), (.=))
import           Data.Aeson.Encode.Pretty   (encodePretty)
import           Data.Aeson.Types           (typeMismatch)
import           Data.ByteString            (ByteString)
import           Data.ByteString.Char8      (pack)
import           Data.Check.Field
import           Data.Functor.Contravariant
import qualified Data.List.NonEmpty         as N
import qualified Data.Map                   as M
import           Data.Maybe                 (fromJust, isJust)
import           Data.Monoid
import           Data.Profunctor
import           Data.Serialize             (Serialize)
import qualified Data.Serialize             as B
import qualified Data.Text                  as T
import           Data.Text.Encoding         (decodeUtf8, encodeUtf8)
import qualified Data.Text.Lazy             as L
import           Data.Time                  (UTCTime)
import           Data.Time.Clock.POSIX      (utcTimeToPOSIXSeconds)
import           Database.PostgreSQL.Simple (Connection)
import           GHC.Generics
import           Lucid
import           Network.HTTP.Types.Status
import           Network.Wai                (Application, Request,
                                             requestHeaders)
import           Opaleye                    (runQuery)
import           System.Entropy
import           Web.ClientSession
import           Web.FormUrlEncoded
import           Web.Scotty
import           Web.Scotty.Cookie

import           Humblr.Database.Models
import           Humblr.Database.Queries
import qualified Humblr.Html                as H

eitherToMaybe :: Either e a -> Maybe a
eitherToMaybe (Left _) = Nothing
eitherToMaybe (Right a) = Just a

humblr :: Key -> Connection -> ScottyM ()
humblr key conn = do
  get "/" $ do
    cookie <- getCookie "auth"
    let maybeUser = encodeUtf8 <$> cookie >>= decrypt key >>= eitherToMaybe . B.decode
    html . renderText $ H.homepage maybeUser M.empty
  post "/login" $ do
    payload <- body
    case urlDecodeForm payload >>= fromForm of
      Left err -> raise $ L.fromStrict err
      Right loginUser -> do
        res <- liftIO $ checkT validateLogin loginUser
        case res of
          Right user -> do
            t <- liftIO . encryptIO key $
              B.encode $ H.DisplayUser (user ^. userId) (user ^. userName)
            status status303
            setHeader "Location" "/"
            setSimpleCookie "auth" $ decodeUtf8 t
          Left errs -> html . renderText . H.homepage Nothing $ fmap (showLoginError . N.head) (getFieldErrors errs)
  where
    passwordMatches password user
      = genHash password (user ^. userSalt) == (user ^. userPassword)

    validateLogin :: CheckFieldT IO LoginError LoginUser User
    validateLogin = proc loginUser -> do
      maybeUser <- liftEffect (selectUserByUsername conn) -< loginUsername loginUser
      expect "username" isJust UserDoesNotExist -< maybeUser
      case maybeUser of
        Just user -> do
          whenFalse "password" PasswordIncorrect -< passwordMatches (loginPassword loginUser) user
          returnA -< user
        Nothing -> failure -< ()


{-
type MyPostsAPI
  = Get '[JSON] [Post] :<|>
    ReqBody '[JSON] CreatePost :> PostCreated '[JSON] ()

type PostAPI
  = Get '[JSON] Post :<|>
    AuthProtect "cookie-auth" :> Delete '[JSON] Text :<|>
    AuthProtect "cookie-auth" :> ReqBody '[JSON] CreatePost :> Patch '[JSON] Text

type HumblrAPI
  = "register" :> ReqBody '[JSON] RegisterUser :> PostCreated '[JSON] () :<|>
    "user" :> Capture "user" Text :> "posts" :> Get '[JSON] [Post] :<|>
    "me" :> AuthProtect "cookie-auth" :> Get '[JSON] UserInfo :<|>
    "my" :> "posts" :> AuthProtect "cookie-auth" :> MyPostsAPI :<|>
    "users" :> Get '[JSON] [DisplayUser] :<|>
    "posts" :> Get '[JSON] [Post] :<|>
    "posts" :> Capture "postId" Int :> PostAPI :<|>
    Get '[HTML] (Html ())
-}

data LoginError
  = UserDoesNotExist
  | PasswordIncorrect

showLoginError :: LoginError -> T.Text
showLoginError UserDoesNotExist = "Incorrect username"
showLoginError PasswordIncorrect = "Incorrect password"


newtype Token = Token { token :: T.Text }
  deriving (Eq, Generic, Show)

instance ToJSON Token where

type User = User' Int T.Text T.Text ByteString ByteString

data RegistrationError
  = EmailExists
  | UsernameExists
  | PasswordTooShort
  deriving (Eq, Show)

showRegistrationError :: RegistrationError -> T.Text
showRegistrationError EmailExists = "That email is already taken"
showRegistrationError UsernameExists = "That username is already taken"
showRegistrationError PasswordTooShort = "Your password is too short"

data LoginUser = LoginUser { loginUsername :: T.Text, loginPassword :: T.Text }
instance FromForm LoginUser where
  fromForm form
    = LoginUser <$>
      parseUnique "username" form <*>
      parseUnique "password" form

data DisplayPost
  = DisplayPost
  { displayPostId     :: Int
  , displayPostAuthor :: T.Text
  , displayPostDate   :: UTCTime
  , displayPostTitle  :: T.Text
  , displayPostBody   :: T.Text
  }
instance ToJSON DisplayPost where
  toJSON post
    = object
      [ "id" .= displayPostId post
      , "author" .= displayPostAuthor post
      , "created" .= (floor $ utcTimeToPOSIXSeconds (displayPostDate post) :: Int)
      , "title" .= displayPostTitle post
      , "body" .= displayPostBody post
      ]

instance FromJSON DisplayPost where
  parseJSON (Object v)
    = DisplayPost <$>
      v .: "id" <*>
      v .: "author" <*>
      v .: "created" <*>
      v .: "title" <*>
      v .: "body"

{-
runValidation :: ToJSON e => ServantErr -> a -> CheckFieldT IO e a b -> (b -> Handler c) -> Handler c
runValidation errCode input validator ifValid = do
  res <- liftIO $ checkT validator input
  case res of
    Right b -> ifValid b
    Left err -> throwError errCode { errBody = encodePretty (M.singleton ("errors" :: Text) err) }
-}

genHash :: T.Text -> ByteString -> ByteString
genHash password = generate (Parameters (2^14) 8 1 100) (encodeUtf8 password)

{-
authHandler :: Key -> AuthHandler Request DisplayUser
authHandler key
  = mkAuthHandler $ \req -> case lookup "auth" (requestHeaders req) of
      Nothing -> throwError $ err401 { errBody = "Missing auth header" }
      Just cookie -> case decrypt key cookie of
        Nothing -> throwError $ err403 { errBody = "Invalid cookie" }
        Just serialized -> case B.decode serialized of
          Left _ -> throwError $ err403 { errBody = "Invalid cookie" }
          Right user -> return user

type instance AuthServerData (AuthProtect "cookie-auth") = DisplayUser

genAuthServerContext :: Key -> Context (AuthHandler Request DisplayUser ': '[])
genAuthServerContext key = authHandler key :. EmptyContext

instance ToJSON LoginError where
  toJSON UserDoesNotExist = toJSON ("User does not exist" :: Text)
  toJSON PasswordIncorrect = toJSON ("Incorrect password" :: Text)

myPostsServer :: Key -> Connection -> DisplayUser -> Server MyPostsAPI
myPostsServer key conn user = myPosts :<|> createPost
  where
    myPosts :: Handler [Post]
    myPosts = do
      rows <- liftIO $ selectPostsForUser conn (user ^. userId)
      return $ fmap (postAuthor .~ user ^. userName) rows

    createPost :: CreatePost -> Handler ()
    createPost post
      = void . liftIO $ insertPost conn (user ^. userId) (post ^. postTitle) (post ^. postBody)

postServer :: Key -> Connection -> Int -> Server PostAPI
postServer key conn pid = postById :<|> deletePostEndpoint :<|> updatePostEndpoint
  where
    postById :: Handler Post
    postById = do
      maybePost <- liftIO $ selectPostById conn pid
      case maybePost of
        Nothing -> throwError $ err401 { errBody = "Post does not exist" }
        Just post -> return post

    deletePostEndpoint :: DisplayUser -> Handler Text
    deletePostEndpoint user = do
      maybePost <- liftIO $ selectPostById conn pid
      case maybePost of
        Nothing -> throwError $ err401 { errBody = "Post does not exist" }
        Just post
          | user ^. userName == post ^. postAuthor -> do
              liftIO $ deletePost conn pid
              return "Post deleted"
          | otherwise -> throwError $ err401 { errBody = "You don't own that post" }

    updatePostEndpoint :: DisplayUser -> CreatePost -> Handler Text
    updatePostEndpoint user post = do
      maybePost <- liftIO $ selectPostById conn pid
      case maybePost of
        Nothing -> throwError $ err401 { errBody = "Post does not exist" }
        Just post'
          | user ^. userName == post' ^. postAuthor -> do
              liftIO $ updatePost conn pid (post ^. postTitle) (post ^. postBody)
              return "Post updated"
          | otherwise -> throwError $ err401 { errBody = "You don't own that post" }

server :: Key -> Connection -> Server HumblrAPI
server key conn
  = register :<|>
    login :<|>
    userPosts :<|>
    me :<|>
    myPostsServer key conn :<|>
    allUsers :<|>
    allPosts :<|>
    postServer key conn :<|>
    homepage
  where
    {-
    validateRegistration :: CheckFieldT IO RegistrationError RegisterUser RegisterUser
    validateRegistration = proc user -> do
      expectM "username" (\u -> not <$> usernameExists conn (u ^. userName)) UsernameExists -< user
      expectM "email" (\u -> not <$> emailExists conn (u ^. userEmail)) EmailExists -< user
      expect "password" (\u -> T.length (u ^. userPassword) >= 8) PasswordTooShort -< user
      returnA -< user
    -}

    register :: RegisterUser -> Handler ()
    register user = void . liftIO $ do
      salt <- getEntropy 100
      insertUser conn (user ^. userName) (user ^. userEmail) (genHash (user ^. userPassword) salt) salt


    userPosts :: Text -> Handler [Post]
    userPosts username = do
      maybeUser <- liftIO $ selectUserByUsername conn username
      case maybeUser of
        Nothing -> throwError $ err401 { errBody = encodePretty UserDoesNotExist }
        Just user -> do
          rows <- liftIO $ selectPostsForUser conn (user ^. userId)
          return $ fmap (postAuthor .~ username) rows

    me :: DisplayUser -> Handler UserInfo
    me user = do
      maybeUser <- liftIO $ selectUserById conn (user ^. userId)
      case maybeUser of
        Nothing -> throwError $ err401 { errBody = encodePretty UserDoesNotExist }
        Just userRow -> return (userRow & userPassword .~ () & userSalt .~ ())

    allUsers :: Handler [DisplayUser]
    allUsers = do
      rows <- liftIO $ selectUsers conn
      return $ fmap (set userEmail () . set userPassword () . set userSalt ()) rows

    allPosts :: Handler [Post]
    allPosts = liftIO $ selectPostsWithAuthors conn

-}
