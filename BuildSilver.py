import os
import re
from string import Template
import sublime, sublime_plugin
import Default

DEFAULT_EXEC = Default.exec.ExecCommand

FLAGS = (  sublime.DRAW_NO_FILL
         | sublime.DRAW_NO_OUTLINE
         | sublime.DRAW_SQUIGGLY_UNDERLINE)

REGION_KEY = 'silicon-errors'
REGION_SCOPE = 'output.error'
ICON = "Packages/Viper-IDE/error.png"

ERROR_PAT = re.compile(r'(.*),([0-9]+):([0-9]+),([0-9]+):([0-9]+),(.*)')

class ErrorData:
  def __init__(self):
    self.file = ''
    self.regions = []
    self.messages = []

error_data = ErrorData()

def log(str):
  print("[Silicon] {}".format(str))

def plugin_loaded():
  # Executed when the plugin is loaded
  # sublime.active_window().active_view().erase_regions(REGION_KEY)
  pass

# def plugin_unloaded():
  # sublime.active_window().erase_regions(REGION_KEY)

class SilverBuildCommand(sublime_plugin.WindowCommand):
  # def __init__(self, window):
    # sublime_plugin.WindowCommand.__init__(self, window)
    # self.poly = None
    # self.current_job = None

  def run(self, **kwargs):
    error_data.file = Template(kwargs['error_file']).substitute(packages = sublime.packages_path())

    del kwargs['error_file']

    log("cwd = {}".format(os.getcwd()))

    self.window.active_view().erase_regions(REGION_KEY)

    # Delete existing error file (if it exists)
    if os.path.isfile(error_data.file):
      os.remove(error_data.file)

    silicon_exec = SiliconExecCommand(self.window)
    silicon_exec.run(**kwargs)

    # output_view = self.window.create_output_panel('exec')
    # output_view = sublime.active_window().get_output_panel("exec")
    # log("highlight_line = {}".format(output_view.settings().get("highlight_line")))
    # output_view.settings().set("highlight_line", "false")
    # log("line_highlight = {}".format(output_view.settings().get("line_highlight")))
    # log("background = {}".format(output_view.settings().get("background")))
    # output_view.settings().set("line_highlight", "#0000FF")
    # print("output_view = {}".format(output_view))
    # sublime.active_window().run_command("show_panel", {"panel": "output.exec"})

    # matches = output_view.find_all(file_regex)
    # print("file_regex = {}".format(file_regex))
    # print("matches = {}".format(matches))

class SiliconExecCommand(DEFAULT_EXEC):
  def __init__(self, *args, **kwargs):
    super(DEFAULT_EXEC, self).__init__(*args, **kwargs)

  def on_finished(self, proc):
    super(DEFAULT_EXEC, self).on_finished(proc)

    # output_view = sublime.active_window().get_output_panel("exec")
    # log("output_view = {}".format(output_view))
    # log("line_highlight = {}".format(output_view.settings().get("line_highlight")))
    # log("background = {}".format(output_view.settings().get("background")))
    # log("highlight_line = {}".format(output_view.settings().get("highlight_line")))

    view = self.window.active_view()
    error_data.regions.clear()
    error_data.messages.clear()

    #print('Log filepath:', error_data.file, '( exists:', os.path.isfile(error_data.file), ')')
    if os.path.isfile(error_data.file):

      with open(error_data.file) as file:
        #print('Error log filepath:', error_data.file, '( exists:', os.path.isfile(error_data.file), ')')
        for line in file:
          line = line.strip()
          components = ERROR_PAT.split(line)
          assert len(components) == 8, "Unexpected number of error components"
          # log(frags)
          # filter(None, frags)

          source_file = components[1]
          start_line = int(components[2])
          start_column = int(components[3])
          end_line = int(components[4])
          end_column = int(components[5])
          message = components[6]
          #log(start_line)
          #log(message)

          # start_point = view.text_point(start_line - 1, start_column - 1)
          start_point = view.text_point(start_line - 1, 0)
          end_point = view.text_point(end_line - 1, end_column - 1)
          region = sublime.Region(start_point, end_point)

          error_data.regions.append(region)
          error_data.messages.append(message)

    #else:
    #  log("Could not find " + error_data.file)

    view.add_regions(REGION_KEY,
                     error_data.regions,
                     REGION_SCOPE,
                     ICON,
                     FLAGS)

    # errs = self.output_view.find_all_results()
    # print("errs = {}".format(errs))
    # if len(errs) == 0:
      # self.window.run_command("hide_panel", {"cancel": True})

class SiliconEventListener(sublime_plugin.EventListener):
  def on_selection_modified(self, view):
    # log("view = {}".format(view))
    # log("view.name = {}".format(view.name()))
    # log("view.id = {}".format(view.id()))

    if view.id() == 30: # view 30 appears to be the output panel
      # view.sel().clear()
      pass

    message = get_current_error_message(view)
    show_error_message_in_status_bar(view, message)

class ShowCurrentErrorMessagePopupCommand(sublime_plugin.TextCommand):
  def run(self, edit):
    message = get_current_error_message(self.view)
    show_error_message_in_popup(self.view, message)

def get_current_error_message(view):
  message = None

  for i, region in enumerate(error_data.regions):
    # print(region)
    if region.contains(view.sel()[0]):
      message = error_data.messages[i]
      break

  return message

def show_error_message_in_status_bar(view, message):
  if not message:
    view.erase_status(REGION_KEY)
  else:
    view.set_status(REGION_KEY, message)

def show_error_message_in_popup(view, message):
  if not message:
    view.hide_popup()
  else:
    view.show_popup(message,
                    max_width = 680,
                    on_navigate=print)