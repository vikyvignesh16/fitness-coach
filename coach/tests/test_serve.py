import socket

import pytest

from coach.serve import open_sockets


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def has_ipv6() -> bool:
    try:
        with socket.socket(socket.AF_INET6) as s:
            s.bind(("::1", 0))
        return True
    except OSError:
        return False


def test_listens_on_ipv4_and_ipv6_on_the_same_port():
    port = free_port()
    socks = open_sockets(port)
    try:
        for s in socks:
            s.listen()
        families = {s.family for s in socks}
        assert socket.AF_INET in families
        if has_ipv6():
            assert socket.AF_INET6 in families
            with socket.create_connection(("::1", port), timeout=2):
                pass
        with socket.create_connection(("127.0.0.1", port), timeout=2):
            pass
    finally:
        for s in socks:
            s.close()


def test_ipv6_socket_is_ipv6_only():
    if not has_ipv6():
        pytest.skip("no IPv6 here")
    socks = open_sockets(free_port())
    try:
        v6 = [s for s in socks if s.family == socket.AF_INET6][0]
        assert v6.getsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY) == 1
    finally:
        for s in socks:
            s.close()


def test_missing_ipv6_falls_back_to_ipv4_only(monkeypatch):
    real = socket.socket

    def fake(family=socket.AF_INET, *a, **k):
        if family == socket.AF_INET6:
            raise OSError("no ipv6")
        return real(family, *a, **k)

    monkeypatch.setattr("coach.serve.socket.socket", fake)
    socks = open_sockets(free_port())
    try:
        assert [s.family for s in socks] == [socket.AF_INET]
    finally:
        for s in socks:
            s.close()


def test_missing_ipv4_stops_loudly(monkeypatch):
    def fake(family=socket.AF_INET, *a, **k):
        raise OSError("nope")

    monkeypatch.setattr("coach.serve.socket.socket", fake)
    with pytest.raises(OSError):
        open_sockets(free_port())
