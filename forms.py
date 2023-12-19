"""Forms for Flask Cafe."""

from flask_wtf import FlaskForm, StringField, TextAreaField, SelectField
from wtforms.validators import InputRequired, Optional, Length, URL


class CafeForm(FlaskForm):
    """ Form for adding and editing cafes """

    name = StringField(
        "Name",
        validators=[InputRequired(), Length(max=300)])

    description = TextAreaField("Description")

    url = StringField(
        "Website",
        validators=[URL()])

    address = StringField(
        "Physical Address",
        validators=[InputRequired()])

    city_code = SelectField(
        "City",
        validators=[InputRequired()])

    image_url = StringField(
        "Photo",
        validators=[URL()])
