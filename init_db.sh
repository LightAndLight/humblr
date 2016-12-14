initdb -D .pgsql/data &&
createdb humblrdb &&
psql -d humblrdb -a -f schema.sql
