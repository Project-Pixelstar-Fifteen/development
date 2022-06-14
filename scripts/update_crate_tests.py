#!/usr/bin/env python3
#
# Copyright (C) 2020 The Android Open Source Project
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Add or update tests to TEST_MAPPING.

This script uses Bazel to find reverse dependencies on a crate and generates a
TEST_MAPPING file. It accepts the absolute path to a crate as argument. If no
argument is provided, it assumes the crate is the current directory.

  Usage:
  $ . build/envsetup.sh
  $ lunch aosp_arm64-eng
  $ update_crate_tests.py $ANDROID_BUILD_TOP/external/rust/crates/libc

This script is automatically called by external_updater.

A test_mapping_config.json file can be defined in the project directory to
configure the generated TEST_MAPPING file, for example:

    {
        // Run tests in postsubmit instead of presubmit.
        "postsubmit_tests":["foo"]
    }

"""

import argparse
import glob
import json
import os
import platform
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# Some tests requires specific options. Consider fixing the upstream crate
# before updating this dictionary.
TEST_OPTIONS = {
    "ring_test_tests_digest_tests": [{"test-timeout": "600000"}],
    "ring_test_src_lib": [{"test-timeout": "100000"}],
}

# Groups to add tests to. "presubmit" runs x86_64 device tests+host tests, and
# "presubmit-rust" runs arm64 device tests on physical devices.
TEST_GROUPS = [
    "presubmit",
    "presubmit-rust",
    "postsubmit",
]

# Excluded tests. These tests will be ignored by this script.
TEST_EXCLUDE = [
        "ash_test_src_lib",
        "ash_test_tests_constant_size_arrays",
        "ash_test_tests_display",
        "shared_library_test_src_lib",
        "vulkano_test_src_lib",

        # These are helper binaries for aidl_integration_test
        # and aren't actually meant to run as individual tests.
        "aidl_test_rust_client",
        "aidl_test_rust_service",
        "aidl_test_rust_service_async",

        # This is a helper binary for AuthFsHostTest and shouldn't
        # be run directly.
        "open_then_run",

        # TODO: Remove when b/198197213 is closed.
        "diced_client_test",
]

# Excluded modules.
EXCLUDE_PATHS = [
        "//external/adhd",
        "//external/crosvm",
        "//external/libchromeos-rs",
        "//external/vm_tools"
]

LABEL_PAT = re.compile('^//(.*):.*$')
EXTERNAL_PAT = re.compile('^//external/rust/')


class UpdaterException(Exception):
    """Exception generated by this script."""


class Env(object):
    """Env captures the execution environment.

    It ensures this script is executed within an AOSP repository.

    Attributes:
      ANDROID_BUILD_TOP: A string representing the absolute path to the top
        of the repository.
    """
    def __init__(self):
        try:
            self.ANDROID_BUILD_TOP = os.environ['ANDROID_BUILD_TOP']
        except KeyError:
            raise UpdaterException('$ANDROID_BUILD_TOP is not defined; you '
                                   'must first source build/envsetup.sh and '
                                   'select a target.')


class Bazel(object):
    """Bazel wrapper.

    The wrapper is used to call bazel queryview and generate the list of
    reverse dependencies.

    Attributes:
      path: The path to the bazel executable.
    """
    def __init__(self, env):
        """Constructor.

        Note that the current directory is changed to ANDROID_BUILD_TOP.

        Args:
          env: An instance of Env.

        Raises:
          UpdaterException: an error occurred while calling soong_ui.
        """
        if platform.system() != 'Linux':
            raise UpdaterException('This script has only been tested on Linux.')
        self.path = os.path.join(env.ANDROID_BUILD_TOP, "tools", "bazel")
        soong_ui = os.path.join(env.ANDROID_BUILD_TOP, "build", "soong", "soong_ui.bash")

        # soong_ui requires to be at the root of the repository.
        os.chdir(env.ANDROID_BUILD_TOP)
        print("Generating Bazel files...")
        cmd = [soong_ui, "--make-mode", "bp2build"]
        try:
            subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True)
        except subprocess.CalledProcessError as e:
            raise UpdaterException('Unable to generate bazel workspace: ' + e.output)

        print("Building Bazel Queryview. This can take a couple of minutes...")
        cmd = [soong_ui, "--build-mode", "--all-modules", "--dir=.", "queryview"]
        try:
            subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True)
        except subprocess.CalledProcessError as e:
            raise UpdaterException('Unable to update TEST_MAPPING: ' + e.output)

    def query_modules(self, path):
        """Returns all modules for a given path."""
        cmd = self.path + " query --config=queryview /" + path + ":all"
        out = subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL, text=True).strip().split("\n")
        modules = set()
        for line in out:
            # speed up by excluding unused modules.
            if "windows_x86" in line:
                continue
            modules.add(line)
        return modules

    def query_rdeps(self, module):
        """Returns all reverse dependencies for a single module."""
        cmd = (self.path + " query --config=queryview \'rdeps(//..., " +
                module + ")\' --output=label_kind")
        out = (subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL, text=True)
                .strip().split("\n"))
        if '' in out:
            out.remove('')
        return out

    def exclude_module(self, module):
        for path in EXCLUDE_PATHS:
            if module.startswith(path):
                return True
        return False

    def query_rdep_tests_dirs(self, modules, path):
        """Returns all reverse dependency tests for modules in this package."""
        rdep_tests = set()
        rdep_dirs = set()
        path_pat = re.compile("^/%s:.*$" % path)
        for module in modules:
            for rdep in self.query_rdeps(module):
                rule_type, _, mod = rdep.split(" ")
                if rule_type == "rust_test_" or rule_type == "rust_test":
                    if self.exclude_module(mod):
                        continue
                    path_match = path_pat.match(mod)
                    if path_match or not EXTERNAL_PAT.match(mod):
                        rdep_tests.add(mod.split(":")[1].split("--")[0])
                    else:
                        label_match = LABEL_PAT.match(mod)
                        if label_match:
                            rdep_dirs.add(label_match.group(1))
        return (rdep_tests, rdep_dirs)


class Package(object):
    """A Bazel package.

    Attributes:
      dir: The absolute path to this package.
      dir_rel: The relative path to this package.
      rdep_tests: The list of computed reverse dependencies.
      rdep_dirs: The list of computed reverse dependency directories.
    """
    def __init__(self, path, env, bazel):
        """Constructor.

        Note that the current directory is changed to the package location when
        called.

        Args:
          path: Path to the package.
          env: An instance of Env.
          bazel: An instance of Bazel.

        Raises:
          UpdaterException: the package does not appear to belong to the
            current repository.
        """
        self.dir = path
        try:
            self.dir_rel = self.dir.split(env.ANDROID_BUILD_TOP)[1]
        except IndexError:
            raise UpdaterException('The path ' + self.dir + ' is not under ' +
                            env.ANDROID_BUILD_TOP + '; You must be in the '
                            'directory of a crate or pass its absolute path '
                            'as the argument.')

        # Move to the package_directory.
        os.chdir(self.dir)
        modules = bazel.query_modules(self.dir_rel)
        (self.rdep_tests, self.rdep_dirs) = bazel.query_rdep_tests_dirs(modules, self.dir_rel)

    def get_rdep_tests_dirs(self):
        return (self.rdep_tests, self.rdep_dirs)


class TestMapping(object):
    """A TEST_MAPPING file.

    Attributes:
      package: The package associated with this TEST_MAPPING file.
    """
    def __init__(self, env, bazel, path):
        """Constructor.

        Args:
          env: An instance of Env.
          bazel: An instance of Bazel.
          path: The absolute path to the package.
        """
        self.package = Package(path, env, bazel)

    def create(self):
        """Generates the TEST_MAPPING file."""
        (tests, dirs) = self.package.get_rdep_tests_dirs()
        if not bool(tests) and not bool(dirs):
            if os.path.isfile('TEST_MAPPING'):
                os.remove('TEST_MAPPING')
            return
        test_mapping = self.tests_dirs_to_mapping(tests, dirs)
        self.write_test_mapping(test_mapping)

    def tests_dirs_to_mapping(self, tests, dirs):
        """Translate the test list into a dictionary."""
        test_mapping = {"imports": []}
        config = None
        if os.path.isfile(os.path.join(self.package.dir, "test_mapping_config.json")):
            with open(os.path.join(self.package.dir, "test_mapping_config.json"), 'r') as fd:
                config = json.load(fd)

        for test_group in TEST_GROUPS:
            test_mapping[test_group] = []
            for test in tests:
                if test in TEST_EXCLUDE:
                    continue
                if config and 'postsubmit_tests' in config:
                    if test in config['postsubmit_tests'] and 'postsubmit' not in test_group:
                        continue
                    if test not in config['postsubmit_tests'] and 'postsubmit' in test_group:
                        continue
                if test in TEST_OPTIONS:
                    test_mapping[test_group].append({"name": test, "options": TEST_OPTIONS[test]})
                else:
                    test_mapping[test_group].append({"name": test})
            test_mapping[test_group] = sorted(test_mapping[test_group], key=lambda t: t["name"])

        for dir in dirs:
            test_mapping["imports"].append({"path": dir})
        test_mapping["imports"] = sorted(test_mapping["imports"], key=lambda t: t["path"])
        test_mapping = {section: entry for (section, entry) in test_mapping.items() if entry}
        return test_mapping

    def write_test_mapping(self, test_mapping):
        """Writes the TEST_MAPPING file."""
        with open("TEST_MAPPING", "w") as json_file:
            json_file.write("// Generated by update_crate_tests.py for tests that depend on this crate.\n")
            json.dump(test_mapping, json_file, indent=2, separators=(',', ': '), sort_keys=True)
            json_file.write("\n")
        print("TEST_MAPPING successfully updated for %s!" % self.package.dir_rel)


def parse_args():
    parser = argparse.ArgumentParser('update_crate_tests')
    parser.add_argument('paths',
                        nargs='*',
                        help='Absolute or relative paths of the projects as globs.')
    parser.add_argument('--branch_and_commit',
                        action='store_true',
                        help='Starts a new branch and commit changes.')
    parser.add_argument('--push_change',
                        action='store_true',
                        help='Pushes change to Gerrit.')
    return parser.parse_args()


def main():
    args = parse_args()
    paths = args.paths if len(args.paths) > 0 else [os.getcwd()]
    # We want to use glob to get all the paths, so we first convert to absolute.
    paths = [Path(path).resolve() for path in paths]
    paths = sorted([path for abs_path in paths
                    for path in glob.glob(str(abs_path))])

    env = Env()
    bazel = Bazel(env)
    for path in paths:
        try:
            test_mapping = TestMapping(env, bazel, path)
            test_mapping.create()
            changed = (subprocess.call(['git', 'diff', '--quiet']) == 1)
            untracked = (os.path.isfile('TEST_MAPPING') and
                         (subprocess.run(['git', 'ls-files', '--error-unmatch', 'TEST_MAPPING'],
                                         stderr=subprocess.DEVNULL,
                                         stdout=subprocess.DEVNULL).returncode == 1))
            if args.branch_and_commit and (changed or untracked):
                subprocess.check_output(['repo', 'start',
                                         'tmp_auto_test_mapping', '.'])
                subprocess.check_output(['git', 'add', 'TEST_MAPPING'])
                # test_mapping_config.json is not always present
                subprocess.call(['git', 'add', 'test_mapping_config.json'],
                                stderr=subprocess.DEVNULL,
                                stdout=subprocess.DEVNULL)
                subprocess.check_output(['git', 'commit', '-m',
                                         'Update TEST_MAPPING\n\nTest: None'])
            if args.push_change and (changed or untracked):
                date = datetime.today().strftime('%m-%d')
                subprocess.check_output(['git', 'push', 'aosp', 'HEAD:refs/for/master',
                                         '-o', 'topic=test-mapping-%s' % date])
        except (UpdaterException, subprocess.CalledProcessError) as err:
            sys.exit("Error: " + str(err))

if __name__ == '__main__':
  main()
