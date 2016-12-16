CREATE TABLE users (
    id serial primary key,
    username varchar(15) unique,
    email varchar(100),
    password_hash bytea,
    salt bytea
);

CREATE TABLE posts (
    id serial primary key,
    user_id integer references users(id),
    time_created timestamp with time zone default current_timestamp,
    title varchar(100),
    body varchar(10000)
);
