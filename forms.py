"""Forms for Flask Cafe."""

from flask_wtf import FlaskForm
from wtforms import StringField, TextAreaField, SelectField
from wtforms.validators import InputRequired, Optional, Length, URL


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

    # TODO: This must change to SelectField and populate from DB.
    # TODO: Make it so that the user can enter stuff like Oakland, not 'oak'
    city_code = SelectField(
        "City",
        validators=[InputRequired()])

    image_url = StringField(
        "Photo",
        validators=[URL(), Optional()])
