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
        self._filters, self._desc, self._limit, self._insert, self._delete = [], False, None, None, False

    def select(self, *_): return self
    def eq(self, column, value):
        self._filters.append((column, value))
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
            row = {"id": f"{self.name}-{self.store._clock}", "created_at": self.store._clock, **self._insert}
            rows.append(row)
            return Result([row])
        found = [r for r in rows if all(r.get(c) == v for c, v in self._filters)]
        found.sort(key=lambda r: r["created_at"], reverse=self._desc)
        return Result(found[: self._limit] if self._limit else found)
