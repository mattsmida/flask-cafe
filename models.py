"""Data models for Flask Cafe"""


from flask_bcrypt import Bcrypt
from flask_sqlalchemy import SQLAlchemy


bcrypt = Bcrypt()
db = SQLAlchemy()
DEFAULT_IMG_PATH = "/static/images/default-store.png"


class City(db.Model):
    """Cities for cafes."""

    __tablename__ = 'cities'

    code = db.Column(
        db.Text,
        primary_key=True,
    )

    name = db.Column(
        db.Text,
        nullable=False,
    )

    state = db.Column(
        db.String(2),
        nullable=False,
    )

    def serialize(self):
        """ Serialize to dictionary. """

        return {
            "code": self.code,
            "name": self.name,
            "state": self.state,
        }


class Cafe(db.Model):
    """Cafe information."""

    __tablename__ = 'cafes'

    id = db.Column(
        db.Integer,
        primary_key=True,
    )

    name = db.Column(
        db.Text,
        nullable=False,
    )

    description = db.Column(
        db.Text,
        nullable=False,
    )

    url = db.Column(
        db.Text,
        nullable=False,
    )

    address = db.Column(
        db.Text,
        nullable=False,
    )

    city_code = db.Column(
        db.Text,
        db.ForeignKey('cities.code'),
        nullable=False,
    )

    image_url = db.Column(
        db.Text,
        nullable=False,
        default=DEFAULT_IMG_PATH,
    )

    city = db.relationship("City", backref='cafes')

    def __repr__(self):
        return f'<Cafe id={self.id} name="{self.name}">'

    def get_city_state(self):
        """Return 'city, state' for cafe."""

        city = self.city
        return f'{city.name}, {city.state}'

    def serialize(self):
        """ Serialize to dictionary. """

        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "url": self.url,
            "address": self.address,
            "city_code": self.city_code,
            "image_url": self.image_url
        }


def connect_db(app):
    """Connect this database to provided Flask app.

    You should call this in your Flask app.
    """

    app.app_context().push()
    db.app = app
    db.init_app(app)
