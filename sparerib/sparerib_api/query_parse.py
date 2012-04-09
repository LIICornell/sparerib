from pyparsing import Word, Optional, ZeroOrMore, Or, QuotedString, Group, Literal, printables, alphas

def SearchSyntax():
    printables_without_colon = ''.join(letter for letter in printables if letter != ':')
    Colon = Literal(":").suppress()
    
    Filter = Group(Word(printables_without_colon) + Colon + Word(printables_without_colon) + Optional(Colon + (QuotedString('"', "\\") | Word(printables)))).setResultsName('filters')
    Filter.modalResults = False
    
    TextTerm = (QuotedString('"', "\\", unquoteResults=False) | Word(printables)).setResultsName('text_terms')
    TextTerm.modalResults = False

    Term = Filter | TextTerm
    Query = ZeroOrMore(Term)
    return Query

_syntax = SearchSyntax()

def parse_query(query):
    parsed = _syntax.parseString(query)
    return {'text': ' '.join(parsed.text_terms), 'filters': parsed.filters.asList() if parsed.filters else []}