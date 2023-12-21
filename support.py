""" Supporting functions for the app. """


def set_dropdown_choices(model, value, label):
    """ Set the choices for a WTForm SelectField (aka, dropdown).
        - model: a model to get the options for
        - value: the values, usually the primary key in the table
        - label: the lables, usually the human-readable version of the value
    Returns a list of tuples [(value_1, label_1) ... (value_n, label_n)]
    """
    records = [r.serialize() for r in model.query.order_by(label).all()]
    choices = [(r[value], r[label]) for r in records]
    return choices


def ultra_print(message):
    """ Print a bunch of stars so you can see your debug statement
        in the console. """
    for x in range(10):
        if x == 5:
            print(message)
        else:
            print("*" * 79)
