"""Flask App for Flask Cafe."""

import os

from flask import Flask, render_template, redirect, flash, g, session, request
from flask_debugtoolbar import DebugToolbarExtension

from models import (db, connect_db, Cafe, City, User, Like,
                    DEFAULT_CAFE_IMG_PATH, DEFAULT_USER_IMG_PATH)
from forms import CafeForm, SignupForm, LoginForm, CSRFForm, ProfileEditForm

from support import set_dropdown_choices, ultra_print


app = Flask(__name__)

app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
    "DATABASE_URL", 'postgresql:///flask_cafe')
app.config['SECRET_KEY'] = os.environ.get("FLASK_SECRET_KEY", "shhhh")
app.config['SQLALCHEMY_ECHO'] = True
# app.config['DEBUG_TB_INTERCEPT_REDIRECTS'] = True

toolbar = DebugToolbarExtension(app)

connect_db(app)

#######################################
# auth & auth routes

CURR_USER_KEY = "curr_user"
NOT_LOGGED_IN_MSG = "You are not logged in."


@app.before_request
def add_user_to_g():
    """If we're logged in, add curr user to Flask global."""

    if CURR_USER_KEY in session:
        g.user = User.query.get(session[CURR_USER_KEY])

    else:
        g.user = None


def do_login(user):
    """Log in user."""

    session[CURR_USER_KEY] = user.id


def do_logout():
    """Logout user."""

    if CURR_USER_KEY in session:
        del session[CURR_USER_KEY]


#######################################
# homepage

@app.get("/")
def homepage():
    """Show homepage."""

    return render_template("homepage.html")


#######################################
# cafes


@app.get('/cafes')
def cafe_list():
    """Return list of all cafes."""

    cafes = Cafe.query.order_by('name').all()

    return render_template(
        'cafe/list.html',
        cafes=cafes,
        category='success'
    )


@app.route('/cafes/add', methods=['GET', 'POST'])
def cafe_add():
    """Show form to add cafe"""

    form = CafeForm()
    # form.city_code.choices = [
    #     (c.code, c.name) for c in City.query.order_by('name').all()]
    form.city_code.choices = set_dropdown_choices(
        City, 'code', 'name')

    if form.validate_on_submit():
        # TODO: One-liner for this?
        cafe = Cafe(
            name=form.name.data,
            description=form.description.data,
            url=form.url.data,
            address=form.address.data,
            city_code=form.city_code.data,
            image_url=form.image_url.data or DEFAULT_CAFE_IMG_PATH)

        db.session.add(cafe)
        db.session.commit()
        flash(f'{cafe.name} added.')
        return redirect(f'/cafes/{cafe.id}')

    return render_template('cafe/add-form.html', form=form)


@app.route('/cafes/<int:cafe_id>/edit/', methods=['GET', 'POST'])
def cafe_edit(cafe_id):
    """Show form to edit cafe"""

    cafe = Cafe.query.get_or_404(cafe_id)
    form = CafeForm(obj=cafe)
    # Is this an acceptable way to handle the default image?
    if form.image_url.data == DEFAULT_CAFE_IMG_PATH:
        form.image_url.data = ''

    form.city_code.choices = set_dropdown_choices(
        City, 'code', 'name')

    if form.validate_on_submit():
        cafe.name = form.name.data,
        cafe.description = form.description.data,
        cafe.url = form.url.data,
        cafe.address = form.address.data,
        cafe.city_code = form.city_code.data,
        cafe.image_url = form.image_url.data.strip() or DEFAULT_CAFE_IMG_PATH

        db.session.commit()
        flash(f'{cafe.name} edited.')
        return redirect(f'/cafes/{cafe.id}')

    return render_template(
        'cafe/edit-form.html', form=form, cafe_name=cafe.name, cafe_id=cafe.id)


@app.get('/cafes/<int:cafe_id>')
def cafe_detail(cafe_id):
    """Show detail for cafe."""

    cafe = Cafe.query.get_or_404(cafe_id)

    return render_template(
        'cafe/detail.html',
        cafe=cafe,
    )


@app.route('/signup', methods=['GET', 'POST'])
def signup():
    form = SignupForm()

    if form.validate_on_submit():

        user = User.register(
            username=form.username.data,
            first_name=form.first_name.data,
            last_name=form.last_name.data,
            description=form.description.data,
            email=form.email.data,
            password=form.password.data,
            image_url=form.image_url.data or DEFAULT_USER_IMG_PATH
        )
        if not user:
            flash('Username already taken.')
            return redirect('/signup')
        do_login(user)
        flash('You are signed up and logged in.')
        return redirect('/cafes')

    return render_template('auth/signup-form.html', form=form)


@app.route('/login', methods=['GET', 'POST'])
def login():
    form = LoginForm()

    if form.validate_on_submit():
        user = User.authenticate(form.username.data, form.password.data)
        if user:
            do_login(user)
            flash(f"Hello, {user.username}!")
            return redirect('/cafes')
        else:
            flash("Invalid credentials.")
            return redirect('/login')

    return render_template('auth/login-form.html', form=form)


@app.post('/logout')
def logout():

    if g.user:
        do_logout()

    flash("You have successfully logged out.")
    return redirect('/')


#######################################
# users


@app.get('/profile')
def show_profile():
    """ Show the profile page. """

    if g.user:
        likes = User.query.filter(
            User.username == g.user.username).first().liked_cafes
        return render_template('profile/detail.html', likes=likes)
    else:
        flash(NOT_LOGGED_IN_MSG)
        return redirect('/login')


@app.route('/profile/edit', methods=['GET', 'POST'])
def edit_profile():
    """ Show and process the profile edit form. """

    if not g.user:
        flash(NOT_LOGGED_IN_MSG)
        return redirect('/cafes')

    form = ProfileEditForm(obj=g.user)
    if form.image_url.data == DEFAULT_USER_IMG_PATH:
        form.image_url.data = ''
    if form.validate_on_submit():
        g.user.first_name = form.first_name.data
        g.user.last_name = form.last_name.data
        g.user.description = form.description.data
        g.user.email = form.email.data
        g.user.image_url = form.image_url.data.strip() or DEFAULT_USER_IMG_PATH

        db.session.commit()
        flash('Profile edited')
        return redirect('/profile')

    else:
        return render_template('profile/edit-form.html', form=form)

#######################################
# likes


@app.get('/api/likes')
def does_user_like_cafe():
    """ For a GET request, return whether user likes the cafe in the
        query string as a boolean
            Receive q-string ?cafe_id=1 --> return {"likes": true|false} """

    # TODO: Each of these API routes needs user login verification.
    cafe_id = request.args['cafe_id']
    return {"likes": int(cafe_id) in [cafe.id for cafe in g.user.liked_cafes]}


@app.post('/api/like')
def user_like_cafe():
    """ For a POST request, given JSON with a cafe_id, make the current
        user like the cafe.
        E.g.,
            Receive {"cafe_id": 1} --> user now likes cafe 1 """

    # TODO: Each of these API routes needs user login verification.
    cafe_id = request.json['cafe_id']
    liked_cafe = Cafe.query.get(cafe_id)
    g.user.liked_cafes.append(liked_cafe)
    db.session.commit()
    return {"liked": cafe_id}


@app.post('/api/unlike')
def user_unlike_cafe():
    """ For a POST request, given JSON with a cafe_id, make the current
        user un-like the cafe.
        E.g.,
            Receive {"cafe_id": 1} --> user no longers likes cafe 1"""

    # TODO: Each of these API routes needs user login verification.
    cafe_id = int(request.json['cafe_id'])
    liked_cafe = Cafe.query.get(cafe_id)
    if liked_cafe:
        g.user.liked_cafes.remove(liked_cafe)
        db.session.commit()
    return {"unliked": cafe_id}


