"""Starts the coach service on IPv4 and IPv6 at the same time.

Why: Railway's health check connects over IPv4, while the private network in an older Railway environment is IPv6 only.
Uvicorn's --host takes one address, and `::` alone failed the health check, so this opens the two sockets itself.
Run it with:  python -m coach.serve   (the port comes from PORT)
"""
import logging
import os
import socket

log = logging.getLogger("coach.serve")


def open_sockets(port: int) -> list[socket.socket]:
    """One IPv4 socket, plus one IPv6 socket if this machine has IPv6. The IPv6 one takes IPv6 only, so the two never clash."""
    sockets = []
    for family, address in ((socket.AF_INET, "0.0.0.0"), (socket.AF_INET6, "::")):
        try:
            sock = socket.socket(family, socket.SOCK_STREAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if family == socket.AF_INET6:
                sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
            sock.bind((address, port))
            sock.set_inheritable(True)
            sockets.append(sock)
        except OSError as err:
            if family == socket.AF_INET:
                raise  # without IPv4 the health check fails, so stop loudly
            log.warning("IPv6 is not available here, listening on IPv4 only: %s", type(err).__name__)
    return sockets


def main() -> None:
    import uvicorn

    from coach.api import build_app

    logging.basicConfig(level=logging.INFO)
    port = int(os.environ.get("PORT", "").strip() or "8000")
    server = uvicorn.Server(uvicorn.Config(build_app(), log_level="info"))
    server.run(sockets=open_sockets(port))


if __name__ == "__main__":
    main()
