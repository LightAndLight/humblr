{-# LANGUAGE Arrows                #-}
{-# LANGUAGE DataKinds                #-}
{-# LANGUAGE FlexibleInstances     #-}
{-# LANGUAGE MultiParamTypeClasses #-}
{-# LANGUAGE OverloadedLabels      #-}
{-# LANGUAGE TemplateHaskell       #-}
{-# LANGUAGE TypeOperators       #-}

module Humblr.Database (
    User'(..)

    , Post'(..)

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

import           Bookkeeper
import           Control.Arrow              (returnA)
import           Data.ByteString            (ByteString)
import           Data.Int                   (Int64)
import Data.Profunctor
import           Data.Profunctor.Product
import           Data.Profunctor.Product.Default
import           Data.Profunctor.Product.TH (makeAdaptorAndInstance)
import           Data.Text                  (Text)
import           Database.PostgreSQL.Simple (Connection)
import           Opaleye
import           Safe                       (headMay)


-- users
-- id | username | email | password_hash | salt
newtype User' a b c d e
  = User' {
    getUser :: Book
      '[ "id" :=> a
       , "username" :=> b
       , "email" :=> c
       , "password" :=> d
       , "salt" :=> e
       ]
    }

type User = User' Int Text Text ByteString ByteString

type UserColumnR =
    User' (Column PGInt4) (Column PGText) (Column PGText) (Column PGBytea) (Column PGBytea)

type UserColumnW =
    User' (Maybe (Column PGInt4)) (Column PGText) (Column PGText) (Column PGBytea) (Column PGBytea)

{-
pUserApplicative :: Applicative f => User' (f a) (f b) (f c) (f d) (f e) -> f (User' a b c d e)
pUserApplicative (User' f)
  = User' <$>
    ((set #id <$> get #id f) <*>
    ((set #username <$> get #username f) <*>
    ((set #email <$> get #email f) <*>
    ((set #password <$> get #password f) <*>
    (flip (set #salt) f <$> get #salt f)))))
-}

pUser :: ProductProfunctor p
     => User' (p a a') (p b b') (p c c') (p d d') (p e e')
     -> p (User' a b c d e) (User' a' b' c' d' e')
pUser (User' f)
  = User' ***$
    (lmap (get #id . getUser) (set #id ***$ get #id f) ****
    (lmap (get #username . getUser) (set #username ***$ get #username f) ****
    (lmap (get #email . getUser) (set #email ***$ get #email f) ****
    (lmap (get #password . getUser) (set #password ***$ get #password f) ****
    (lmap (get #salt . getUser) $ flip (set #salt) f ***$ get #salt f)))))

instance
  ( ProductProfunctor p
  , Default p a a'
  , Default p b b'
  , Default p c c'
  , Default p d d'
  , Default p e e'
  ) => Default p (User' a b c d e) (User' a' b' c' d' e') where
  def = pUser . User' $ emptyBook
    & #id =: def
    & #username =: def
    & #email =: def
    & #password =: def
    & #salt =: def

-- posts
-- id | user_id | title | body
newtype Post' a b c d
  = Post' {
    getPost :: Book
      '[ "id" :=> a
       , "userId" :=> b
       , "title" :=> c
       , "body" :=> d
       ]
    }

type Post = Post' Int Int Text Text

type PostColumnR = Post' (Column PGInt4) (Column PGInt4) (Column PGText) (Column PGText)

type PostColumnW = Post' (Maybe (Column PGInt4)) (Column PGInt4) (Column PGText) (Column PGText)

pPost :: ProductProfunctor p
     => Post' (p a a') (p b b') (p c c') (p d d')
     -> p (Post' a b c d) (Post' a' b' c' d')
pPost (Post' f)
  = Post' ***$
    (lmap (get #id . getPost) (set #id ***$ get #id f) ****
    (lmap (get #userId . getPost) (set #userId ***$ get #userId f) ****
    (lmap (get #title . getPost) (set #title ***$ get #title f) ****
    (lmap (get #body . getPost) $ flip (set #body) f ***$ get #body f))))

instance
  ( ProductProfunctor p
  , Default p a a'
  , Default p b b'
  , Default p c c'
  , Default p d d'
  ) => Default p (Post' a b c d) (Post' a' b' c' d') where
  def = pPost . Post' $ emptyBook
    & #id =: def
    & #userId =: def
    & #title =: def
    & #body =: def

userTable :: Table UserColumnW UserColumnR
userTable = Table "users" . pUser . User' $ emptyBook
  & #id =: optional "id"
  & #username =: required "username"
  & #email =: required "email"
  & #password =: required "password_hash"
  & #salt =: required "salt"

userQuery :: Query UserColumnR
userQuery = queryTable userTable

selectUsers :: Connection -> IO [User]
selectUsers conn = runQuery conn userQuery

selectUserById :: Connection -> Int -> IO (Maybe User)
selectUserById conn uid = fmap headMay $ runQuery conn $ proc () -> do
    (User' userRow) <- userQuery -< ()
    restrict -< get #id userRow .== pgInt4 uid
    returnA -< (User' userRow)

selectUserByUsername :: Connection -> Text -> IO (Maybe User)
selectUserByUsername conn uname = fmap headMay $ runQuery conn $ proc () -> do
    (User' userRow) <- userQuery -< ()
    restrict -< get #username userRow .== pgStrictText uname
    returnA -< (User' userRow)

postTable :: Table PostColumnW PostColumnR
postTable = Table "posts" . pPost . Post' $ emptyBook
    & #id =: optional "id"
    & #userId =: required "user_id"
    & #title =: required "title"
    & #body =: required "body"

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
    (User' userRow) <- userQuery -< ()
    (Post' postRow) <- postQuery -< ()
    restrict -< get #id userRow .== get #userId postRow
    returnA -< (Post' postRow,get #username userRow)

selectPostsWithAuthors :: Connection -> IO [(Post,Text)]
selectPostsWithAuthors conn = runQuery conn postsWithAuthorsQuery

postsForUserQuery :: Int -> Query PostColumnR
postsForUserQuery uid = proc () -> do
    (Post' postRow) <- postQuery -< ()
    restrict -< pgInt4 uid .== get #userId postRow
    returnA -< (Post' postRow)

selectPostsForUser :: Connection -> Int -> IO [Post]
selectPostsForUser conn uid = runQuery conn $ postsForUserQuery uid

postWithIdQuery :: Int -> Query (Column PGText, PostColumnR)
postWithIdQuery pid = proc () -> do
    (Post' postRow,username) <- postsWithAuthorsQuery -< ()
    restrict -< pgInt4 pid .== get #id postRow
    returnA -< (username, Post' postRow)

selectPostWithId
  :: Connection
  -> Int
  -> IO (Maybe (Book '["id" :=> Int, "userId" :=> Int, "title" :=> Text, "body" :=> Text, "username" :=> Text]))
selectPostWithId conn pid = do
  res <- runQuery conn (postWithIdQuery pid)
  return $ lmap (fmap getPost) (uncurry (set #username)) <$> headMay res

insertPost :: Connection -> Int -> Text -> Text -> IO Int
insertPost conn uid title body = fmap head $ runInsertReturning conn postTable newPost (get #id . getPost)
  where
    newPost = Post' $ emptyBook
      & #id =: Nothing
      & #userId =: pgInt4 uid
      & #title =: pgStrictText title
      & #body =: pgStrictText body

updatePost :: Connection -> Int -> Text -> Text -> IO ()
updatePost conn pid title body = do
    runUpdate conn postTable updateFunc pred
    return ()
  where
    updateFunc (Post' p) = Post' $ p
      & #id %: Just
      & #title =: pgStrictText title
      & #body =: pgStrictText body
    pred (Post' p) = get #id p .== pgInt4 pid

deletePost :: Connection -> Int -> IO ()
deletePost conn pid = do
    runDelete conn postTable pred
    return ()
  where
    pred (Post' p) = get #id p .== pgInt4 pid

insertUser :: Connection -> Text -> Text -> ByteString -> ByteString -> IO Int
insertUser conn username email passwordHash salt = fmap head $
    runInsertReturning conn userTable newUser (get #id . getUser)
  where
    newUser = User' $ emptyBook
      & #id =: Nothing
      & #username =: pgStrictText username
      & #email =: pgStrictText email
      & #password =: pgStrictByteString passwordHash
      & #salt =: pgStrictByteString salt
