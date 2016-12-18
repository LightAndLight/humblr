{-# LANGUAGE FlexibleInstances #-}

-- | Check is used to "check" inputs and log errors on failure
--
-- This is done by building a `CheckT` computation, which contains all the rules that some data
-- should satisy, then using `check` to run it with some input. If errors occurred
-- they are logged and returned, otherwise an output is returned.
--
-- The most effective way to build a `CheckT` computation is using the `Arrow` interface.
--
-- > {-# language Arrows #-}
-- >
-- > import Data.List
-- > import Humblr.Check
-- >
-- > data User = User { username :: String, password :: String, email :: String }
-- >
-- > data UserError
-- >   = EmailInvalid
-- >   | UsernameNotAllowed
-- >   | PasswordTooWeak
-- >
-- > validEmail = not . isPrefixOf "invalid"
-- > strongPassword = (>= 8) . length
-- >
-- > usernameAllowed :: String -> IO Bool
-- > usernameAllowed username = do
-- >   let usernamesInDatabase = ["foo", "bar", "baz"] -- Imagine this is a database lookup
-- >   return $ username `notElem` usernamesInDatabase
-- >
-- > validateUser :: CheckT IO [UserError] User User
-- > validateUser = proc user -> do
-- >   expect (validEmail . email) [EmailInvalid] -< user
-- >   expect (strongPassword . password) [PasswordTooWeak] -< user
-- >   expectM (usernameAllowed . username) [UsernameNotAllowed] -< user
-- >   returnA -< user
--
-- >>> check validateUser (User "allowed_username" "weak" "invalid@email.com")
-- Left [PasswordTooWeak, EmailInvalid]
--
-- >>> check validateUser (User "allowed_username" "strong_password" "valid@email.com")
-- Right (User "allowed_username" "strong_password" "valid_email")
--
-- A `CheckT` computation can have an output type that is different to its input type,
-- as well as letting intermediate results influence the flow of checking
--
-- > data LoginPayload = LoginPayload { loginUsername :: String, loginPassword :: String }
-- >
-- > data LoginError = UserNotFound | PasswordIncorrect
-- >
-- > lookupUser :: String -> IO (Maybe User)
-- >
-- > validateLogin :: CheckT IO LoginError LoginPayload User
-- > validateLogin = proc payload -> do
-- >   maybeUser <- runM lookupUser -< loginUsername payload
-- >   expect isJust [UserNotFound] -< maybeUser
-- >   case maybeUser of
-- >     Just user -> do
-- >       whenFalse [PasswordIncorrect] -< password user == loginPassword payload
-- >       returnA -< user
-- >     Nothing -> failure -< ()
--
-- >>> check validateLogin (LoginPayload "incorrect_username" "incorrect_password")
-- Left [UserNotFound]
--
-- >>> check validateLogin (LoginPayload "correct_username" "incorrect_password")
-- Left [PasswordIncorrect]
--
-- >>> check validateLogin (LoginPayload "correct_username" "correct_password")
-- Right (User "correct_username" "correct_password" "user@email.com")

module Humblr.Check
  ( CheckT
  , Check
  , checkT
  , check
  , expectM
  , expect
  , expectAll
  , supposeM
  , suppose
  , whenFalse
  , liftEffect
  , failure
  ) where

import           Control.Arrow
import           Control.Category
import           Control.Monad.IO.Class
import           Data.Functor
import           Data.Functor.Identity
import           Data.Profunctor
import           Data.Semigroup
import           Prelude                hiding (id, (.))

-- | 'CheckT' transforms an @input@ into an @output@ in some @monad@ while potentially generating @error@s
newtype CheckT monad error input output = CheckT { runCheckT :: input -> monad (Maybe error,output) }

-- | Non-effectful checking
type Check error input output = CheckT Identity error input output

-- | Get the results of running an effectful check on an input
checkT :: Monad m => CheckT m e a b -> a -> m (Either e b)
checkT (CheckT ab) a = do
  (errs,b) <- ab a
  return $ maybe (Right b) Left errs

-- | Get the results of running a non-effectful check on an input
check :: Check e a b -> a -> Either e b
check c a = runIdentity $ checkT c a

instance (Monad m, Semigroup e) => Category (CheckT m e) where
  id = CheckT (pure . (,) Nothing)
  CheckT bc . CheckT ab = CheckT $ \a -> do
    (errs,b) <- ab a
    (errs',c) <- bc b
    return (errs <> errs',c)

instance Functor m => Functor (CheckT m e a) where
  fmap f (CheckT ab) = CheckT (fmap (fmap f) . ab)

instance (Applicative m, Semigroup e) => Applicative (CheckT m e a) where
  pure b = CheckT (pure . (,) Nothing . const b)
  (CheckT f) <*> (CheckT b) = CheckT $ \a -> combine <$> f a <*> b a
    where
      combine f' b' = (fst f' <> fst b', snd f' $ snd b')

instance Functor m => Profunctor (CheckT m e) where
  lmap f (CheckT ab) = CheckT (ab . f)
  rmap = fmap

instance (Monad m, Semigroup e) => Arrow (CheckT m e) where
  arr f = CheckT (pure . (,) Nothing . f)
  (CheckT ab) *** (CheckT ab') = CheckT $ \(a,a') -> do
    (errs,b) <- ab a
    (errs',b') <- ab' a'
    return (errs <> errs',(b,b'))

instance (Monad m, Semigroup e) => ArrowChoice (CheckT m e) where
  (CheckT ab) +++ (CheckT ab') = CheckT $ \ea -> case ea of
    Left a -> do
      b <- ab a
      return $ Left <$> b
    Right a' -> do
      b' <- ab' a'
      return $ Right <$> b'

instance (Monad m, Semigroup e) => Monoid (CheckT m e a a) where
  mempty = id
  mappend = (.)

-- | Runs a predicate, and logs an error if the predicate fails
expectM
  :: (Monad m, Semigroup e)
  => (a -> m Bool)  -- ^ Effectful predicate
  -> e              -- ^ Errors to log if predicate fails
  -> CheckT m e a a
expectM p err = CheckT $ \a -> do
  res <- p a
  return (if res then Nothing else Just err,a)

-- | Like 'expectM' but with a non-effectful predicate
expect :: (Applicative m, Semigroup e) => (a -> Bool) -> e -> CheckT m e a a
expect p err = CheckT $ \a -> pure (if p a then Nothing else Just err,a)

-- | Combine many predicate-error pairs into a single check
--
-- > expectAll = foldMap (uncurry expectM)
expectAll :: (Foldable f, Monad m, Semigroup e) => f (a -> m Bool,e) -> CheckT m e a a
expectAll = foldMap (uncurry expectM)

-- | Runs a predicate, logging some errors if the predicate fails, and returns the result of the predicate
supposeM :: (Monad m, Semigroup e) => (a -> m Bool) -> e -> CheckT m e a Bool
supposeM p err = CheckT $ \a -> do
  res <- p a
  return (if res then Nothing else Just err,res)

-- | Like 'supposeM' but with a non-effectful predicate
suppose :: (Applicative m, Semigroup e) => (a -> Bool) -> e -> CheckT m e a Bool
suppose p err = CheckT $ \a -> let res = p a in pure (if res then Nothing else Just err,res)

-- | Logs an error when `False` is passed in
whenFalse :: (Applicative m, Semigroup e) => e -> CheckT m e Bool Bool
whenFalse = expect id

-- | A check that will fail on any input
failure :: (Applicative m, Monoid e) => CheckT m e a b
failure = CheckT (pure . const (Just mempty,undefined))

-- | Use an effectful computation to transform the input
liftEffect :: Monad m => (a -> m b) -> CheckT m e a b
liftEffect f = CheckT $ \a -> (,) Nothing <$> f a
