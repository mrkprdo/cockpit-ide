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
	for %%i in (release\*.exe) do start "" "%%i" && exit /b

clean:
	if exist dist rmdir /s /q dist
	if exist node_modules rmdir /s /q node_modules
	if exist release rmdir /s /q release

test:
	npm test
