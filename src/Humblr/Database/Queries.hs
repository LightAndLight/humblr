{-# LANGUAGE Arrows #-}

module Humblr.Database.Queries
  ( insertUser
  , insertPost

  , selectPosts
  , selectPostsForUser
  , selectPostsWithAuthors
  , selectPostWithId

  , usernameExists
  , emailExists

  , selectUsers
  , selectUserById
  , selectUserByUsername

  , updatePost
  , deletePost
  ) where

import           Control.Arrow              (returnA)
import           Control.Lens
import           Data.ByteString            (ByteString)
import           Data.Int                   (Int64)
import           Data.Profunctor.Product    (p2, p3, p4)
import           Data.Text                  (Text)
import           Data.Time                  (UTCTime)
import           Database.PostgreSQL.Simple (Connection)
import           Opaleye                    hiding (not, null)
import           Safe                       (headMay)

import           Humblr.Database.Models

type User = User' Int Text Text ByteString ByteString
type Post = Post' Int Int UTCTime Text Text

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
selectUserByUsername conn = fmap headMay . selectUserByUsernameQuery conn

usernameExists :: Connection -> Text -> IO Bool
usernameExists conn = fmap (not . null) . selectUserByUsernameQuery conn

selectUserByUsernameQuery :: Connection -> Text -> IO [User]
selectUserByUsernameQuery conn uname = runQuery conn $ proc () -> do
  userRow <- userQuery -< ()
  restrict -< userRow ^. userName .== pgStrictText uname
  returnA -< userRow

selectUserByEmail :: Connection -> Text -> IO (Maybe User)
selectUserByEmail conn = fmap headMay . selectUserByUsernameQuery conn

emailExists :: Connection -> Text -> IO Bool
emailExists conn = fmap (not . null) . selectUserByEmailQuery conn

selectUserByEmailQuery :: Connection -> Text -> IO [User]
selectUserByEmailQuery conn uemail = runQuery conn $ proc () -> do
  userRow <- userQuery -< ()
  restrict -< userRow ^. userEmail .== pgStrictText uemail
  returnA -< userRow

postQuery :: Query PostColumnR
postQuery = queryTable postTable

selectPosts :: Connection -> IO [Post]
selectPosts conn = runQuery conn postQuery

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
insertPost conn uid title body
  = head <$> runInsertReturning conn postTable newPost _postId
  where
    newPost
      = Post Nothing (pgInt4 uid) Nothing (pgStrictText title) (pgStrictText body)

updatePost :: Connection -> Int -> Text -> Text -> IO ()
updatePost conn pid title body = do
  runUpdate conn postTable updateFunc pred
  return ()
  where
    updateFunc p = p
      { _postId = Just (p ^. postId)
      , _postTitle = pgStrictText title
      , _postCreated = Just (p ^. postCreated)
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
insertUser conn username email passwordHash salt = head <$>
  runInsertReturning conn userTable newUser _userId
  where
    newUser
      = User Nothing
        (pgStrictText username)
        (pgStrictText email)
        (pgStrictByteString passwordHash)
        (pgStrictByteString salt)
