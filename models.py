"""Data models for Flask Cafe"""


from flask_bcrypt import Bcrypt
from flask_sqlalchemy import SQLAlchemy


bcrypt = Bcrypt()
db = SQLAlchemy()
DEFAULT_CAFE_IMG_PATH = "/static/images/default-store.png"
DEFAULT_USER_IMG_PATH = "/static/images/default-pic.jpg"


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
        default=DEFAULT_CAFE_IMG_PATH,
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


class User(db.Model):
    """User information."""

    __tablename__ = 'users'

    id = db.Column(
        db.Integer,
        primary_key=True,
    )

    username = db.Column(
        db.Text,
        nullable=False,
        unique=True
    )

    admin = db.Column(
        db.Boolean,
        default=False
    )

    first_name = db.Column(
        db.Text,
        nullable=False,
    )

    last_name = db.Column(
        db.Text,
        nullable=False,
    )

    email = db.Column(
        db.Text,
        nullable=False,
        unique=True
    )

    description = db.Column(
        db.Text,
        nullable=False,
    )

    image_url = db.Column(
        db.Text,
        nullable=False,
        default=DEFAULT_USER_IMG_PATH,
    )

    hashed_password = db.Column(
        db.Text,
        nullable=False
    )

    def __repr__(self):
        return f'<User id={self.id} name="{self.get_full_name()}">'

    def get_full_name(self):
        """ Return the user's full name as a string. """

        return f'{self.first_name} {self.last_name}'

    @classmethod
    def register(self, username, first_name, last_name, description, email,
                 password, image_url=None, admin=False):
        """ Register a new user and handle password hashing. """
        hash = bcrypt.generate_password_hash(password).decode('utf8')

        user = User(
            username=username,
            email=email,
            first_name=first_name,
            last_name=last_name,
            description=description,
            image_url=image_url,
            hashed_password=hash
        )
        db.session.add(user)
        db.session.commit()
        return user
        # TODO: Probably need something to handle failure of user creation

    @classmethod
    def authenticate(self, username, password):
        user = User.query.filter(User.username == username).first()
        try:
            hashed_pw = user.hashed_password
        except AttributeError:  # query turned up nothing
            return False
        return user if bcrypt.check_password_hash(
            hashed_pw, password) else False

    def serialize(self):
        """ Serialize to dictionary. """

        return {
            "id": self.id,
            "username": self.username,
            "admin": self.admin,
            "email": self.email,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "description": self.description,
            "image_url": self.image_url,
            "hashed_password": self.hashed_password,
        }


def connect_db(app):
    """Connect this database to provided Flask app.

    You should call this in your Flask app.
    """

    app.app_context().push()
    db.app = app
    db.init_app(app)
