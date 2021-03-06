const fs = require('fs')
const path = require('path')

const del = require('del')
const gulp = require('gulp')
const runSequence = require('run-sequence')
const browserSync = require('browser-sync')
const gulpLoadPlugins = require('gulp-load-plugins')
const merge = require('merge-stream')

const hbs = require('./hbs')

/**
 * Config
 */
const config = require('./config')
const { cwd, assets, temp, output, debug, remote, branch, deploy } = config

/**
 * Load all plugin for gulp
 */
const $ = gulpLoadPlugins()

/**
 * BrowserSync Server
 */
const bs = browserSync.create()

// ----------------------------------------------------------------------------

/**
 * Auto generate project structure
 */
gulp.task('init', () => {
  const { log, colors } = $.util

  if (fs.readdirSync(cwd).length) {
    return log(colors.red(cwd), colors.blue('is not empty'))
  }

  const example = path.join(__dirname, '../example')

  return gulp.src(path.join(example, '**'), { base: example, dot: true })
    .pipe($.plumber())
    .pipe($.ignore([
      `**/${path.relative(cwd, output)}`,
      `**/${path.relative(cwd, output)}/**`
    ]))
    .pipe(gulp.dest(cwd))
})

/**
 * Compile styles task
 */
gulp.task('styles', () => {
  return gulp.src(path.join(assets, '**/*.scss'), { base: cwd })
    .pipe($.plumber())
    .pipe($.if(debug, $.sourcemaps.init()))
    .pipe($.sass.sync({ outputStyle: 'expanded' }))
    // https://github.com/gulp-sourcemaps/gulp-sourcemaps/issues/60
    .pipe($.if(!debug, $.autoprefixer({ browsers: ['last 2 versions'] })))
    .pipe($.if(!debug, $.cssnano()))
    .pipe($.if(debug, $.sourcemaps.write('.')))
    .pipe($.rename(p => { p.dirname = p.dirname.replace('scss', 'css').replace('sass', 'css') }))
    .pipe(gulp.dest(temp))
    .pipe(bs.reload({ stream: true }))
})

/**
 * Compile scripts task
 */
gulp.task('scripts', () => {
  return gulp.src(path.join(assets, '**/*.js'), { base: cwd })
    .pipe($.plumber())
    .pipe($.if(debug, $.sourcemaps.init()))
    // vendor
    // .pipe($.babel({ presets: [require('babel-preset-env')] }))
    .pipe($.if(!debug, $.uglify()))
    .pipe($.if(debug, $.sourcemaps.write('.')))
    .pipe(gulp.dest(temp))
    .pipe(bs.reload({ stream: true }))
})

/**
 * Compile pages task
 */
gulp.task('pages', () => {
  return gulp.src(path.join(cwd, '*.html'), { base: cwd })
    .pipe($.plumber())
    .pipe(hbs(config))
    .pipe($.if(!debug, $.htmlmin({
      collapseWhitespace: true,
      minifyCSS: true,
      minifyJS: { compress: { drop_console: true } },
      processConditionalComments: true,
      removeComments: true,
      removeEmptyAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true
    })))
    .pipe(gulp.dest(temp))
})

/**
 * Compile task
 */
gulp.task('compile', cb => runSequence(['styles', 'scripts', 'pages'], cb))

/**
 * Start develop browser sync serve
 */
gulp.task('serve', ['compile'], () => {
  bs.use(require('bs-html-injector'), {
    files: path.join(temp, '*.html')
  })

  bs.init({
    notify: false,
    port: config.port,
    server: {
      baseDir: [temp, cwd],
      routes: { '/node_modules': 'node_modules' }
    }
  })

  $.watch(path.join(assets, '**/*.{jpg,jpeg,png,gif,svg}'), bs.reload)
  $.watch(path.join(assets, '**/*.scss'), () => runSequence('styles'))
  $.watch(path.join(assets, '**/*.js'), () => runSequence('scripts'))
  $.watch(path.join(cwd, '**/*.html'), () => runSequence('pages'))
})

// ----------------------------------------------------------------------------

/**
 * Images task
 */
gulp.task('images', () => {
  return gulp.src(path.join(assets, '**/*.{jpg,jpeg,png,gif,svg}'), { base: cwd })
    .pipe($.plumber())
    .pipe($.if(!debug, $.imagemin()))
    .pipe(gulp.dest(output))
})

/**
 * Extras task
 */
gulp.task('extras', () => {
  const temps = gulp.src(path.join(temp, '**'), { base: temp })
    .pipe($.plumber())
    .pipe(gulp.dest(output))

  // extra files
  const extras = gulp.src(path.join(cwd, '**'), { base: cwd })
    .pipe($.plumber())
    .pipe($.ignore({ isDirectory: true }))
    .pipe($.ignore([
      `**/${path.relative(cwd, output)}/**`,
      '**/*.html',
      '**/*.js',
      '**/*.scss',
      '**/*.{jpg,jpeg,png,gif,svg}'
    ].concat(config.exclude || [])))
    .pipe(gulp.dest(output))

  return merge(temps, extras)
})

/**
 * Build task
 */
gulp.task('clean', del.bind(null, [output]))

/**
 * Build task
 */
gulp.task('build', ['clean'], cb => runSequence(['images', 'compile'], 'extras', cb))

/**
 * Start browser sync serve
 */
gulp.task('serve:dist', ['build'], () => {
  browserSync.init({
    notify: false,
    port: config.port,
    server: {
      baseDir: [output]
    }
  })
})

/**
 * Deploy to GitHub Pages
 */
gulp.task('deploy', ['build'], () => {
  return gulp.src(path.join(output, '**'))
    .pipe($.plumber())
    .pipe($.ghPages({
      remoteUrl: remote,
      branch: branch,
      cacheDir: deploy
    }))
})

module.exports = gulp
