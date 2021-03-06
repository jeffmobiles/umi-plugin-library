import rimraf from 'rimraf';
import Rollup from './rollup';
import Babel from './babel';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { IApi } from 'umi-plugin-types';
import { IBundleOptions, IArgs } from '..';
import { useTypescript } from '../utils';

class Bundler {
  private bundlerRollup: Rollup;
  private bundlerBabel: Babel;
  private distFolder: string[];
  private api: IApi;

  constructor(api: IApi) {
    this.api = api;
    this.bundlerRollup = new Rollup(api);
    this.bundlerBabel = new Babel(api);
    this.distFolder = ['dist', 'lib', 'es'];
  }

  public async build(opts: IBundleOptions) {
    const { cwd, pkg } = this.api;
    this.clean(cwd);
    await this.bundlerRollup.build(opts, pkg, cwd);
    await this.bundlerBabel.build(opts);
  }

  public async buildForLerna(opts: IBundleOptions) {
    const folders = readdirSync(join(this.api.cwd, 'packages'));

    for (const folder of folders) {
      const cwd = join(this.api.cwd, 'packages', folder);
      const pkgPath = join(cwd, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = readFileSync(pkgPath, 'utf-8');
        this.clean(cwd);

        // specify package runtime configure.
        const rcPath = join(cwd, '.umirc.library.js');
        const rc = existsSync(rcPath) ? require(rcPath) : {};

        const combinedRc = { ...opts, ...rc };
        // avoid treat as ts package that use root tsconfig.json
        combinedRc.typescript = rc.typescript !== undefined ? rc.typescript : useTypescript(cwd);

        await this.bundlerRollup.build(combinedRc, JSON.parse(pkg), cwd);
      } else {
        this.api.log.warn(`package.json not found in packages/${folder}`);
      }
    }

    if ((opts.esm && opts.esm.type === 'babel') || (opts.cjs && opts.cjs.type === 'babel')) {
      this.api.log.error(`not support use babel with lerna yet`);
    }
  }

  private clean(cwd: string) {
    this.distFolder.forEach(item => {
      rimraf.sync(join(cwd, item));
    });
  }
}

export default async (api: IApi, opts: IBundleOptions, args: IArgs) => {
  const subCommand = args._[0];
  const bundler = new Bundler(api);
  opts.watch = opts.watch !== undefined ? opts.watch : args.w || args.watch;

  // Support extend lib's sub command in other plugins
  const subCommandHandler = api.applyPlugins('modifyLibrarySubCommandHandler', {
    initialValue: {},
  });
  const handler = subCommandHandler[subCommand];
  if (handler) {
    return handler({
      args,
    });
  }

  if (subCommand === 'build') {
    const useLerna = existsSync(join(api.cwd, 'lerna.json'));
    if (useLerna && process.env.LERNA !== 'none') {
      await bundler.buildForLerna(opts);
    } else {
      await bundler.build(opts);
    }
  }
};
