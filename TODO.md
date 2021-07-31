1. Use tsconfig from users workspace folder, closest to the ipynb file.
2. Generate/update sourcemaps when we process code for async.
3. Interactive widow will be better
4. Better want to view image tensors
5. Variable viewer? or tensor viewer or easy image viewer (from tensors)?
6. Changing cwd permanently
7. Cell magics (to change CWD, send variable from node to browser)?

# Bugs
* We cannot append multiple Mime types to an existing output. E.g. can't put two stdout & 3 dtderr & html into an Output.
We're supposed to have unique output
We're supposed to have unique mime types in each Output.
* When we get messages from renderer, we don't know what notebook it belongs to.
NotebookEditor doesn't have any public members.
