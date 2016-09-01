{-# language Arrows, FlexibleInstances, MultiParamTypeClasses, TemplateHaskell #-}

module Humblr.Database (
    User'(..)
    , userId
    , userName
    , userEmail
    , userPassword
    , userSalt

    , Post'(..)
    , postId
    , postUserId
    , postTitle
    , postBody

    , insertUser
    , insertPost

    , selectPosts
    , selectPostsForUser
    , selectPostsWithAuthors
    , selectPostWithId

    , selectUsers
    , selectUserById
    , selectUserByUsername

    , updatePost
    , deletePost 
) where

import Control.Arrow (returnA)
import Control.Lens
import Data.ByteString (ByteString)
import Data.Int (Int64)
import Data.Profunctor.Product (p2, p3, p4)
import Data.Profunctor.Product.TH (makeAdaptorAndInstance)
import Data.Text (Text)
import Database.PostgreSQL.Simple (Connection)
import Opaleye
import Safe (headMay)


-- users
-- id | username | email | password_hash | salt
data User' a b c d e = User {
    _userId :: a
    , _userName :: b
    , _userEmail :: c
    , _userPassword :: d
    , _userSalt :: e
    }

type User = User' Int Text Text ByteString ByteString

makeLenses ''User'


type UserColumnR =
    User' (Column PGInt4) (Column PGText) (Column PGText) (Column PGBytea) (Column PGBytea)

type UserColumnW =
    User' (Maybe (Column PGInt4)) (Column PGText) (Column PGText) (Column PGBytea) (Column PGBytea)

$(makeAdaptorAndInstance "pUser" ''User')


-- posts
-- id | user_id | title | body
data Post' a b c d = Post {
    _postId :: a
    , _postUserId :: b
    , _postTitle :: c
    , _postBody :: d
    }

type Post = Post' Int Int Text Text

makeLenses ''Post'


type PostColumnR = Post' (Column PGInt4) (Column PGInt4) (Column PGText) (Column PGText)

type PostColumnW = Post' (Maybe (Column PGInt4)) (Column PGInt4) (Column PGText) (Column PGText)

$(makeAdaptorAndInstance "pPost" ''Post')


userTable :: Table UserColumnW UserColumnR
userTable = Table "users" $ pUser User {
    _userId = optional "id"
    , _userName = required "username"
    , _userEmail = required "email"
    , _userPassword = required "password_hash"
    , _userSalt = required "salt"
    }

userQuery :: Query UserColumnR
userQuery = queryTable userTable

selectUsers :: Connection -> IO [User]
selectUsers conn = runQuery conn userQuery

selectUserById :: Connection -> Int -> IO (Maybe User)
selectUserById conn uid = fmap headMay $ runQuery conn $ proc () -> do
    userRow <- userQuery -< ()
    restrict -< userRow ^. userId .== pgInt4 uid
    returnA -< userRow

selectUserByUsername :: Connection -> Text -> IO (Maybe User)
selectUserByUsername conn uname = fmap headMay $ runQuery conn $ proc () -> do
    userRow <- userQuery -< ()
    restrict -< userRow ^. userName .== pgStrictText uname
    returnA -< userRow

postTable :: Table PostColumnW PostColumnR
postTable = Table "posts" $ pPost Post {
    _postId = optional "id"
    , _postUserId = required "user_id"
    , _postTitle = required "title"
    , _postBody = required "body"
    }

postQuery :: Query PostColumnR
postQuery = queryTable postTable

selectPosts :: Connection -> IO [Post]
selectPosts conn = runQuery conn postQuery

type NullableUserColumn = User'
    (Column (Nullable PGInt4))
    (Column (Nullable PGText))
    (Column (Nullable PGText))
    (Column (Nullable PGBytea))
    (Column (Nullable PGBytea))

type NullableUser = User'
    (Maybe Int)
    (Maybe Text)
    (Maybe Text)
    (Maybe ByteString)
    (Maybe ByteString)

postsWithAuthorsQuery :: Query (PostColumnR,Column PGText)
postsWithAuthorsQuery = proc () -> do
    userRow <- userQuery -< ()
    postRow <- postQuery -< ()
    restrict -< userRow ^. userId .== postRow ^. postUserId
    returnA -< (postRow,userRow ^. userName)

selectPostsWithAuthors :: Connection -> IO [(Post,Text)]
selectPostsWithAuthors conn = runQuery conn postsWithAuthorsQuery

postsForUserQuery :: Int -> Query PostColumnR
postsForUserQuery uid = proc () -> do
    postRow <- postQuery -< ()
    restrict -< pgInt4 uid .== postRow ^. postUserId
    returnA -< postRow

selectPostsForUser :: Connection -> Int -> IO [Post]
selectPostsForUser conn uid = runQuery conn $ postsForUserQuery uid

postWithIdQuery :: Int -> Query (PostColumnR,Column PGText)
postWithIdQuery pid = proc () -> do
    (postRow,username) <- postsWithAuthorsQuery -< ()
    restrict -< pgInt4 pid .== postRow ^. postId
    returnA -< (postRow,username)

selectPostWithId :: Connection -> Int -> IO (Maybe (Post,Text))
selectPostWithId conn pid = headMay <$> runQuery conn (postWithIdQuery pid)

insertPost :: Connection -> Int -> Text -> Text -> IO Int
insertPost conn uid title body = fmap head $ runInsertReturning conn postTable newPost _postId
  where
    newPost = Post Nothing (pgInt4 uid) (pgStrictText title) (pgStrictText body)

updatePost :: Connection -> Int -> Text -> Text -> IO ()
updatePost conn pid title body = do
    runUpdate conn postTable updateFunc pred
    return ()
  where
    updateFunc p = p {
        _postId = Just (p ^. postId)
        , _postTitle = pgStrictText title
        , _postBody = pgStrictText body
        }
    pred p = p ^. postId .== pgInt4 pid

deletePost :: Connection -> Int -> IO ()
deletePost conn pid = do
    runDelete conn postTable pred
    return ()
  where
    pred p = p ^. postId .== pgInt4 pid

insertUser :: Connection -> Text -> Text -> ByteString -> ByteString -> IO Int
insertUser conn username email passwordHash salt = fmap head $
    runInsertReturning conn userTable newUser _userId
  where
    newUser = User Nothing
        (pgStrictText username)
        (pgStrictText email)
        (pgStrictByteString passwordHash)
        (pgStrictByteString salt)
