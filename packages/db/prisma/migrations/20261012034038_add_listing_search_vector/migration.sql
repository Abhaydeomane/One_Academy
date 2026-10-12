-- Free-text search over Listing, maintained by triggers so the index cannot
-- drift from the data regardless of what writes the row. See ADR 0011.
ALTER TABLE "Listing" ADD COLUMN "searchVector" tsvector;

CREATE INDEX "Listing_searchVector_idx" ON "Listing" USING GIN ("searchVector");

-- Weighted so a name match outranks a description match:
--   A name   B exam labels   C locality + city   D description
CREATE OR REPLACE FUNCTION listing_search_vector(
  p_name text,
  p_locality text,
  p_description text,
  p_city_id text,
  p_listing_id text
) RETURNS tsvector LANGUAGE sql STABLE AS $$
  SELECT
    setweight(to_tsvector('english', coalesce(p_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce((
      SELECT string_agg(t.label, ' ')
      FROM "ListingTag" lt
      JOIN "Tag" t ON t.id = lt."tagId"
      WHERE lt."listingId" = p_listing_id
    ), '')), 'B') ||
    setweight(to_tsvector('english',
      coalesce(p_locality, '') || ' ' ||
      coalesce((SELECT name FROM "City" WHERE id = p_city_id), '')
    ), 'C') ||
    setweight(to_tsvector('english', coalesce(p_description, '')), 'D')
$$;

-- 1. The listing's own fields changed. BEFORE, and assigns NEW rather than
--    issuing an UPDATE, so it cannot recurse. Scoped to these four columns so
--    that trigger 2's UPDATE of searchVector alone does not re-fire it.
CREATE OR REPLACE FUNCTION listing_search_vector_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchVector" := listing_search_vector(
    NEW.name, NEW.locality, NEW."shortDescription", NEW."cityId", NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_search_vector_biu
BEFORE INSERT OR UPDATE OF name, locality, "shortDescription", "cityId"
ON "Listing" FOR EACH ROW EXECUTE FUNCTION listing_search_vector_sync();

-- 2. A listing's exam tags changed. On INSERT into Listing the tags do not
--    exist yet (Prisma writes them in a second statement), so this is what
--    fills in weight B.
CREATE OR REPLACE FUNCTION listing_tag_search_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE target text;
BEGIN
  target := COALESCE(NEW."listingId", OLD."listingId");
  UPDATE "Listing" l
  SET "searchVector" = listing_search_vector(
    l.name, l.locality, l."shortDescription", l."cityId", l.id
  )
  WHERE l.id = target;
  RETURN NULL;
END;
$$;

CREATE TRIGGER listing_tag_search_aid
AFTER INSERT OR DELETE ON "ListingTag"
FOR EACH ROW EXECUTE FUNCTION listing_tag_search_sync();

-- 3. A tag was renamed; every listing carrying it needs recomputing.
CREATE OR REPLACE FUNCTION tag_label_search_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "Listing" l
  SET "searchVector" = listing_search_vector(
    l.name, l.locality, l."shortDescription", l."cityId", l.id
  )
  WHERE l.id IN (SELECT "listingId" FROM "ListingTag" WHERE "tagId" = NEW.id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER tag_label_search_au
AFTER UPDATE OF label ON "Tag"
FOR EACH ROW EXECUTE FUNCTION tag_label_search_sync();

-- Backfill existing rows now that the machinery exists.
UPDATE "Listing" l SET "searchVector" = listing_search_vector(
  l.name, l.locality, l."shortDescription", l."cityId", l.id
);
