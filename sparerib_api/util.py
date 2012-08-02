from django.conf import settings
import pymongo

import datetime, calendar

ISO_DATE = '%Y-%m-%d'

def expand_weeks(weeks):
    ranged = [{
        'date_range': [datetime.datetime.strptime(d, ISO_DATE).date() for d in key],
        'count': value
    } for key, value in weeks if key is not None]
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

def expand_months(months):
    ranged = [{
        'date_range': [datetime.datetime.strptime(key + "-01", ISO_DATE).date(), datetime.datetime.strptime(key + "-" + str(calendar.monthrange(*map(int, key.split("-")))[1]), ISO_DATE).date()],
        'count': value
    } for key, value in months if key is not None]
    out = []
    for i in xrange(len(ranged) - 1):
        month = ranged[i]['date_range']
        next = ranged[i + 1]['date_range']

        out.append(ranged[i])
        for offset in range(1, int(round((next[0] - month[0]).days / 30.5))):
            next_month_day = month[0] + datetime.timedelta(days=32)
            out.append({
                'date_range': [datetime.date(year=next_month_day.year, month=next_month_day.month, day=1), datetime.date(year=next_month_day.year, month=next_month_day.month, day=calendar.monthrange(next_month_day.year, next_month_day.month)[1])],
                'count': 0
            })
    out.append(ranged[-1])

    return out