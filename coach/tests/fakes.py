"""A tiny stand in for the Supabase client, for tests. It remembers inserts and answers the two selects the guard makes."""


class Result:
    def __init__(self, data):
        self.data = data


class FakeSupabase:
    def __init__(self, cap=None, spent=0):
        self.inserts: list[dict] = []
        self._cap, self._spent = cap, spent

    def table(self, name):
        return _Table(self, name)


class _Table:
    def __init__(self, db, name):
        self.db, self.name, self._insert = db, name, None

    def select(self, *_): return self
    def eq(self, *_): return self
    def gte(self, *_): return self

    def insert(self, row):
        self._insert = row
        return self

    def execute(self):
        if self._insert is not None:
            self.db.inserts.append(self._insert)
            return Result([self._insert])
        if self.name == "coach_settings":
            return Result([] if self.db._cap is None else [{"monthly_cap_usd": self.db._cap}])
        return Result([{"cost_usd": self.db._spent}] if self.db._spent else [])


class FakeStore:
    """An in memory stand in for the database tables, for memory tests. Supports the few calls the memory code makes."""

    def __init__(self):
        self.tables: dict[str, list[dict]] = {}
        self._clock = 0

    def table(self, name):
        return _StoreQuery(self, name)


class _StoreQuery:
    def __init__(self, store, name):
        self.store, self.name = store, name
        self._filters, self._ranges, self._desc, self._limit, self._insert, self._delete = [], [], False, None, None, False

    def select(self, *_): return self
    def eq(self, column, value):
        self._filters.append((column, value))
        return self

    def gte(self, column, value):
        self._ranges.append((column, ">=", value))
        return self

    def lte(self, column, value):
        self._ranges.append((column, "<=", value))
        return self

    def order(self, column, desc=False):
        self._desc = desc
        return self

    def limit(self, n):
        self._limit = n
        return self

    def insert(self, row):
        self._insert = row
        return self

    def delete(self):
        self._delete = True
        return self

    def execute(self):
        rows = self.store.tables.setdefault(self.name, [])
        if self._delete:
            gone = [r for r in rows if all(r.get(c) == v for c, v in self._filters)]
            rows[:] = [r for r in rows if r not in gone]
            return Result(gone)
        if self._insert is not None:
            self.store._clock += 1
            make_id = getattr(self.store, "make_id", None)  # a test store can hand out real looking UUIDs
            row = {"id": make_id(self.store._clock) if make_id else f"{self.name}-{self.store._clock}", "created_at": self.store._clock, **self._insert}
            rows.append(row)
            return Result([row])
        found = [r for r in rows if all(r.get(c) == v for c, v in self._filters)
                 and all(c not in r or (r[c] >= v if op == ">=" else r[c] <= v) for c, op, v in self._ranges)]
        found.sort(key=lambda r: r["created_at"], reverse=self._desc)
        return Result(found[: self._limit] if self._limit else found)


class FakeLibrary(FakeSupabase):
    """FakeSupabase plus an in memory library_chunks table and a match_library_chunks function that uses real cosine distance."""

    def __init__(self, **kw):
        super().__init__(**kw)
        self.chunks: list[dict] = []
        self.rpc_calls: list[dict] = []

    def table(self, name):
        return _LibraryQuery(self) if name == "library_chunks" else super().table(name)

    def rpc(self, name, params):
        assert name == "match_library_chunks"
        self.rpc_calls.append(params)
        return _Rpc(self, params)


class _LibraryQuery:
    def __init__(self, db):
        self.db, self._filters, self._upsert, self._delete = db, [], None, False

    def select(self, *_): return self
    def delete(self):
        self._delete = True
        return self
    def eq(self, column, value):
        self._filters.append((column, "eq", value))
        return self
    def gte(self, column, value):
        self._filters.append((column, "gte", value))
        return self
    def upsert(self, rows, on_conflict):
        self._upsert = (rows, on_conflict.split(","))
        return self

    def _matches(self, row):
        return all(row[c] == v if op == "eq" else row[c] >= v for c, op, v in self._filters)

    def execute(self):
        if self._upsert:
            rows, keys = self._upsert
            for new in rows:
                for old in self.db.chunks:
                    if all(old[k] == new[k] for k in keys):
                        old.update(new)
                        break
                else:
                    self.db.chunks.append(dict(new, id=f"chunk-{len(self.db.chunks) + 1}"))
            return Result(rows)
        found = [r for r in self.db.chunks if self._matches(r)]
        if self._delete:
            self.db.chunks[:] = [r for r in self.db.chunks if r not in found]
        return Result(found)


class _Rpc:
    def __init__(self, db, params):
        self.db, self.params = db, params

    def execute(self):
        def distance(a, b):
            dot = sum(x * y for x, y in zip(a, b))
            return 1 - dot / ((sum(x * x for x in a) ** 0.5) * (sum(y * y for y in b) ** 0.5))

        rows = [r for r in self.db.chunks if self.params["only_kind"] in (None, r["kind"])]
        scored = sorted(({**r, "distance": distance(self.params["query_embedding"], r["embedding"])} for r in rows),
                        key=lambda r: r["distance"])
        return Result(scored[: self.params["match_count"]])
