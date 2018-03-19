# FriGG README

Replace parameters in template scripts. Specify a custom paramter pattern or use the default @@<PARAMETER_NAME>@@. 
Parameter values are stored in a separate json file.

If a parameter file is missing a new one will be created with values found in the original file:

![Parameters discovery](resources/parameter_discovery.gif)

Once a parameter file is present it will be used to replace values:

![Replace parameters](resources/parameter_replacement.gif)

Any new parameter added to the original file will be automatically added to the value file as an empty parameter.

Parameter of type string will be automatically wrapped in double quotes, no escaping will be done, so you'll need to handle quoting on your end.

## Features

- replace parameters in template files
- parameters auto-discovery and auto-updating
- parameter value serialization
- custom parameter pattern

## Extension Settings

This extension contributes the following settings:

* `frigg.parameterPattern`: specifies the parameters regex pattern, 
  * defaults to: `@@[^@\\s]+@@`
* `frigg.deleteMissingParams`: if true automatically deletes parameter values from the json file if deleted from the template file

## Known Issues

Not yet :)

## Release Notes

### 0.0.1

Initial release of FriGG! I hope you enjoy it!
