1. Use tsconfig from users workspace folder, closest to the ipynb file.
2. Generate/update sourcemaps when we process code for async.
3. Interactive widow will be better
4. Better want to view image tensors
5. Variable viewer? or tensor viewer or easy image viewer (from tensors)?
6. Changing cwd permanently
7. Cell magics (to change CWD, send variable from node to browser)?
8. Use shell path from vscode settings
Ignore language (doesn't matter whether its shell or powershell).
At the end of the day the shell is setup by the user.
9. For simple (most common) shell commands like `echo`, `rm`, `pwd`, `cwd`, we don't need a real terminal, just run as a spawn (faster). As long as ther'es nothing streaming.
# Bugs
* We cannot append multiple Mime types to an existing output. E.g. can't put two stdout & 3 dtderr & html into an Output.
We're supposed to have unique output
We're supposed to have unique mime types in each Output.
* When we get messages from renderer, we don't know what notebook it belongs to.
NotebookEditor doesn't have any public members.
