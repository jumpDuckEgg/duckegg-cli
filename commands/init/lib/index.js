'use strict';
const Command = require('@duckegg-cli/command');
const log = require('@duckegg-cli/log');

class InitCommand extends Command {
    init() {
        this.projectName = this._argv[0];
        this.force = !!this._argv[this._argv.length - 1].force;
        log.verbose('projectName', this.projectName);
        log.verbose('force', this.force);
    }

    exec() {
        console.log('exec')
    }
}

function init(argv) {
    return new InitCommand(argv);
}

module.exports = init;
module.exports.InitCommand = InitCommand;