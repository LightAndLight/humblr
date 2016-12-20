{-# LANGUAGE Arrows                     #-}
{-# LANGUAGE DataKinds                  #-}
{-# LANGUAGE DeriveGeneric              #-}
{-# LANGUAGE FlexibleInstances          #-}
{-# LANGUAGE GeneralizedNewtypeDeriving #-}
{-# LANGUAGE OverloadedStrings          #-}
{-# LANGUAGE TypeFamilies               #-}
{-# LANGUAGE TypeOperators              #-}

module Humblr (humblr) where

import           Control.Arrow
import           Control.Lens               (mapped, over, set, (&), (.~), (^.))
import           Control.Monad.Except
import           Control.Monad.IO.Class     (liftIO)
import           Crypto.KDF.Scrypt
import           Data.Aeson                 (FromJSON (..), ToJSON (..),
                                             Value (..), object, (.:), (.=))
import           Data.Aeson.Encode.Pretty   (encodePretty)
import           Data.Aeson.Types           (typeMismatch)
import           Data.ByteString            (ByteString)
import           Data.ByteString.Char8      (pack)
import           Data.Check.Field
import           Data.Functor.Contravariant
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
import           Network.Wai                (Application, Request,
                                             requestHeaders)
import           Opaleye                    (runQuery)
import           System.Entropy
import           Web.ClientSession
import           Web.FormUrlEncoded
import           Web.Scotty

import           Humblr.Database.Models
import           Humblr.Database.Queries
import qualified Humblr.Html                as H

humblr :: Key -> Connection -> IO Application
humblr key conn = scottyApp (humblrApp key conn)

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
    "login" :> ReqBody '[FormUrlEncoded] LoginUser :> S.Post '[JSON] Token :<|>
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

humblrApp :: Key -> Connection -> ScottyM ()
humblrApp key conn = do
  get "/" . html . renderText $ H.homepage M.empty
  post "/login" $ do
    payload <- body
    case urlDecodeForm payload >>= fromForm of
      Left err -> raise $ L.fromStrict err
      Right loginUser -> do
        res <- liftIO $ checkT validateLogin loginUser
        case res of
          Right user -> do
            t <- liftIO . encryptIO key $
              B.encode (user &
                userEmail .~ () &
                userPassword .~ () &
                userSalt .~ ())
            json (Token $ decodeUtf8 t)
          Left errs -> html . renderText . H.homepage $ fmap showLoginError errs
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

newtype Token = Token { token :: T.Text }
  deriving (Eq, Generic, Show)

instance ToJSON Token where

type User = User' Int T.Text T.Text ByteString ByteString

data RegistrationError
  = EmailExists
  | UsernameExists
  | PasswordTooShort
  deriving (Eq, Show)

showLoginError :: LoginError -> T.Text
showLoginError EmailExists = "That email is already taken"
showLoginError UsernameExists = "That username is already taken"
showLoginError PasswordTooShort = "Your password is too short"

data LoginUser = LoginUser { loginUsername :: T.Text, loginPassword :: T.Text }
instance FromForm LoginUser where
  fromForm form
    = LoginUser <$>
      parseUnique "username" form <*>
      parseUnique "password" form

{-
instance Serialize DisplayUser where
  put user = do
    B.put (user ^. userId)
    B.put $ encodeUtf8 (user ^. userName)

  get = User <$> B.get <*> (decodeUtf8 <$> B.get) <*> pure () <*> pure () <*> pure ()
-}

type Post = Post' Int T.Text UTCTime T.Text T.Text
instance ToJSON Post where
  toJSON post
    = object
      [ "id" .= (post ^. postId)
      , "author" .= (post ^. postAuthor)
      , "created" .= (floor $ utcTimeToPOSIXSeconds (post ^. postCreated) :: Int)
      , "title" .= (post ^. postTitle)
      , "body" .= (post ^. postBody)
      ]

instance FromJSON Post where
  parseJSON (Object v)
    = Post <$>
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
      expectM "email" (\u -> not <$> emailExists conn (u ^. userEmail)) EmailExists -< user
      expect "password" (\u -> T.length (u ^. userPassword) >= 8) PasswordTooShort -< user
      returnA -< user
    -}

    register :: RegisterUser -> Handler ()
    register user = void . liftIO $ do
      salt <- getEntropy 100
      insertUser conn (user ^. userName) (user ^. userEmail) (genHash (user ^. userPassword) salt) salt

    passwordMatches password user
      = genHash password (user ^. userSalt) == (user ^. userPassword)

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
