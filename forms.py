"""Forms for Flask Cafe."""

from flask_wtf import FlaskForm
from wtforms import (StringField, TextAreaField, SelectField, PasswordField)
from wtforms.validators import (InputRequired, Optional, Length, URL, Email)
# TODO: import email_validator


class CafeForm(FlaskForm):
    """ Form for adding and editing cafes """

    name = StringField(
        "Name",
        validators=[InputRequired(), Length(max=300)])

    description = TextAreaField("Description")

    url = StringField(
        "Website",
        validators=[URL(), Optional()])

    address = StringField(
        "Physical Address",
        validators=[InputRequired()])

    city_code = SelectField(
        "City",
        validators=[InputRequired()])

    image_url = StringField(
        "Photo",
        validators=[URL(), Optional()])


class UserForm(FlaskForm):
    """ Form for adding and editing users """

    username = StringField(
        "Username",
        validators=[InputRequired(), Length(max=300)])

    first_name = StringField(
        "First name",
        validators=[InputRequired(), Length(max=100)])

    last_name = StringField(
        "Last name",
        validators=[Length(max=100)])

    description = TextAreaField("Describe yourself.")

    email = StringField(
        "Email",
        validators=[InputRequired()])

    password = PasswordField(
        "Password",
        validators=[InputRequired(), Length(min=6, max=64)])

    image_url = StringField(
        "Photo",
        validators=[URL(), Optional()])


class LoginForm(FlaskForm):
    """ Form for logging in """
    username = StringField(
        "Username",
        validators=[InputRequired()])

    password = PasswordField(
        "Password",
        validators=[InputRequired()])


class CSRFForm(FlaskForm):
    """ Empty form for CSRF protection """
