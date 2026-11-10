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
