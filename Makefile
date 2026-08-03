.PHONY: dev prod build clean package test install

build:
	npm run build

dev: build
	node dev.js

prod: build
	npx electron .

package: test
	npm run pack

install:
	for /f "delims=" %%i in ('dir /b /o:-n out\CockpitIDESetup-*.exe 2^>nul') do (start "" "out\%%i" & exit /b)

clean:
	if exist dist rmdir /s /q dist
	if exist node_modules rmdir /s /q node_modules
	if exist release rmdir /s /q release
	if exist out rmdir /s /q out

test:
	npm test
	npm run loc:check
	npm run console:check
