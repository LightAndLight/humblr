{-# LANGUAGE Arrows #-}

module Humblr.Database.Queries
  ( PostWithAuthor
  , insertUser
  , insertPost

  , selectPosts
  , selectPostsForUser
  , selectPostsWithAuthors
  , selectPostById

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
type PostWithAuthor = Post' Int Text UTCTime Text Text

userQuery :: Query UserColumnR
userQuery = queryTable userTable

selectUsers :: Connection -> IO [User]
selectUsers conn = runQuery conn userQuery

selectUserByIdQuery :: Int -> Query UserColumnR
selectUserByIdQuery uid = proc () -> do
  userRow <- userQuery -< ()
  restrict -< userRow ^. userId .== pgInt4 uid
  returnA -< userRow

selectUserById :: Connection -> Int -> IO (Maybe User)
selectUserById conn = fmap headMay . runQuery conn . selectUserByIdQuery

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

type PostWithAuthorColumn
  = Post'
    (Column PGInt4)
    (Column PGText)
    (Column PGTimestamptz)
    (Column PGText)
    (Column PGText)

postsWithAuthorsQuery :: Query PostWithAuthorColumn
postsWithAuthorsQuery = proc () -> do
  userRow <- userQuery -< ()
  postRow <- postQuery -< ()
  restrict -< userRow ^. userId .== postRow ^. postAuthor
  returnA -< (postRow & postAuthor .~ (userRow ^. userName))

selectPostsWithAuthors :: Connection -> IO [PostWithAuthor]
selectPostsWithAuthors conn = runQuery conn postsWithAuthorsQuery

postsForUserQuery :: Int -> Query PostWithAuthorColumn
postsForUserQuery uid = proc () -> do
  userRow <- selectUserByIdQuery uid -< ()
  postRow <- postQuery -< ()
  restrict -< pgInt4 uid .== postRow ^. postAuthor
  returnA -< (postRow & postAuthor .~ (userRow ^. userName))

selectPostsForUser :: Connection -> Int -> IO [PostWithAuthor]
selectPostsForUser conn uid = runQuery conn $ postsForUserQuery uid

postByIdQuery :: Int -> Query PostWithAuthorColumn
postByIdQuery pid = proc () -> do
  postRow <- postsWithAuthorsQuery -< ()
  restrict -< pgInt4 pid .== postRow ^. postId
  returnA -< postRow

selectPostById :: Connection -> Int -> IO (Maybe PostWithAuthor)
selectPostById conn pid = headMay <$> runQuery conn (postByIdQuery pid)

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
    updateFunc p
      = p &
        over postId Just &
        postTitle .~ pgStrictText title &
        over postCreated Just &
        postBody .~ pgStrictText body
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
