from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs): super().__init__(*args,directory='/home/aliemad/projects/classic-gallery',**kwargs)
 def translate_path(self,path):
  if path.startswith('/logos/'):
   name=path.split('/')[-1]
   if name.endswith('.png') and name[:-4].isdigit(): return '/home/aliemad/projects/pitchiq/public/logos/'+name
  return super().translate_path(path)
 def guess_type(self,path):
  kind=super().guess_type(path)
  return kind+'; charset=utf-8' if kind.startswith('text/') else kind
ThreadingHTTPServer(('127.0.0.1',8903),Handler).serve_forever()
