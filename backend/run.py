import os

from app import create_app

app = create_app()


def _env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


if __name__ == '__main__':
    host = os.getenv('APP_HOST', 'localhost')
    port = int(os.getenv('APP_PORT', '5050'))
    debug = _env_bool('APP_DEBUG', False)
    app.run(host=host, port=port, debug=debug)
