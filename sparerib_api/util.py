from django.conf import settings
import pymongo

import datetime, calendar, re, urllib

ISO_DATE = '%Y-%m-%d'

def prettify_weeks(weeks, expand=False):
    ranged = [{
        'date_range': [datetime.datetime.strptime(d, ISO_DATE).date() for d in key],
        'count': value
    } for key, value in weeks if key is not None]

    if not ranged:
        return []

    if not expand:
        return ranged

    out = []
    for i in xrange(len(ranged) - 1):
        week = ranged[i]['date_range']
        next = ranged[i + 1]['date_range']

        out.append(ranged[i])
        for offset in range(1, (next[0] - week[0]).days / 7):
            delta = datetime.timedelta(days=7*offset)
            out.append({
                'date_range': [week[0] + delta, week[1] + delta],
                'count': 0
            })
    out.append(ranged[-1])

    return out

def prettify_months(months, expand=False):
    ranged = [{
        'date_range': [datetime.datetime.strptime(key + "-01", ISO_DATE).date(), datetime.datetime.strptime(key + "-" + str(calendar.monthrange(*map(int, key.split("-")))[1]), ISO_DATE).date()],
        'count': value
    } for key, value in months if key is not None]

    if not ranged:
        return []

    if not expand:
        return ranged

    out = []
    for i in xrange(len(ranged) - 1):
        month = ranged[i]['date_range']
        next = ranged[i + 1]['date_range']

        out.append(ranged[i])
        for offset in range(1, int(round((next[0] - month[0]).days / 30.5))):
            next_month_day = month[0] + datetime.timedelta(days=(30.5 * offset) + 1)
            out.append({
                'date_range': [datetime.date(year=next_month_day.year, month=next_month_day.month, day=1), datetime.date(year=next_month_day.year, month=next_month_day.month, day=calendar.monthrange(next_month_day.year, next_month_day.month)[1])],
                'count': 0
            })
    out.append(ranged[-1])

    return out

DOCKET_YEAR_FINDER = re.compile("[_-](\d{4})[_-]")
def get_docket_year(docket_id):
    year_match = DOCKET_YEAR_FINDER.search(docket_id)
    if year_match and year_match.groups():
        return year_match.groups()[0]
    else:
        return None

def url_quote(s):
    if type(s) == unicode:
        s = s.encode('utf-8', errors='ignore')
    return urllib.quote(s)

def uniq(seq):
    seen = set()
    seen_add = seen.add
    return [x for x in seq if x not in seen and not seen_add(x)]

DETAILS_OVERRIDES = {}
def dtls(*args):
    out = []
    for key, value in args:
        if key and value:
            key = DETAILS_OVERRIDES.get(key, key.replace('_', ' '))
            if type(value) == datetime.datetime:
                value = short_date(value)
            out.append((key, value))
    return out

def combine(*args, **kwargs):
    sep = kwargs.get('sep', ' ')
    vals = [val for val in args if val]
    return sep.join(vals)

def short_date(d):
    return d.strftime("%b %d, %Y") if d else None

from django.contrib.localflavor.us.us_states import US_STATES
STATES = dict(US_STATES)
def expand_state(state):
    return STATES.get(state, state)